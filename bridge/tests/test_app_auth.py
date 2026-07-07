"""Stories: app factory, lazy client, auth, health, verbose logging.

- FastAPI as the HTTP framework, tests driven through TestClient
- tests mock the simplegmail Gmail client (simplegmail never imported)
- use the JosephMRally simplegmail fork, imported lazily in the default factory
- pass both token and client-secret paths to the Gmail constructor; a valid
  saved token is reused
- AUTH_REQUIRED JSON error when neither the saved token nor the OAuth client exists
- simplegmail client constructed lazily on the first request that needs it
- GET /health returns {status: "ok"} with no Gmail call
- -v/--verbose request logging, off by default
"""

import logging
import sys
import types

from fastapi import FastAPI
from fastapi.testclient import TestClient

from bridge.app import create_app
from fixtures import FakeGmail, FakeLabel


def test_story_fastapi_app_driven_through_testclient():
    app = create_app(gmail_factory=FakeGmail)
    assert isinstance(app, FastAPI)
    assert TestClient(app).get("/health").status_code == 200


def test_story_health_returns_ok_with_no_gmail_call():
    factory_calls = []

    def factory():
        factory_calls.append(1)
        return FakeGmail()

    client = TestClient(create_app(gmail_factory=factory))
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert factory_calls == []


def test_story_gmail_client_constructed_lazily_on_first_request_then_reused():
    factory_calls = []
    gmail = FakeGmail(labels=[FakeLabel("INBOX", "INBOX")])

    def factory():
        factory_calls.append(1)
        return gmail

    client = TestClient(create_app(gmail_factory=factory))

    assert len(factory_calls) == 0  # not at app construction
    client.get("/health")
    assert len(factory_calls) == 0  # not for health
    assert client.get("/tags").status_code == 200
    assert len(factory_calls) == 1  # first request that needs Gmail
    assert client.get("/tags").status_code == 200
    assert len(factory_calls) == 1  # reused, not rebuilt


def test_story_tests_mock_gmail_client_simplegmail_never_imported():
    gmail = FakeGmail(labels=[FakeLabel("INBOX", "INBOX")])
    client = TestClient(create_app(gmail_factory=lambda: gmail))
    assert client.get("/tags").status_code == 200
    assert "simplegmail" not in sys.modules


def test_story_default_factory_lazily_imports_simplegmail_and_passes_both_cred_paths(
    tmp_path, monkeypatch
):
    constructed = []
    inner = FakeGmail(labels=[FakeLabel("INBOX", "INBOX")])

    class ForkGmail:
        def __init__(self, client_secret_file=None, creds_file=None, **kwargs):
            constructed.append(
                {"client_secret_file": client_secret_file, "creds_file": creds_file}
            )
            self._inner = inner

        def __getattr__(self, name):
            return getattr(self._inner, name)

    fake_module = types.ModuleType("simplegmail")
    fake_module.Gmail = ForkGmail
    monkeypatch.setitem(sys.modules, "simplegmail", fake_module)

    token = tmp_path / "gmail-token.json"
    token.write_text("{}")  # a valid saved token exists and is reused
    client_secret = tmp_path / "client_secret.json"  # deliberately absent

    app = create_app(token_path=str(token), client_secret_path=str(client_secret))
    response = TestClient(app).get("/tags")

    assert response.status_code == 200
    assert constructed == [
        {"client_secret_file": str(client_secret), "creds_file": str(token)}
    ]


def test_story_auth_required_error_when_neither_token_nor_client_secret_exists(tmp_path):
    token = tmp_path / "gmail-token.json"  # never created
    client_secret = tmp_path / "client_secret.json"  # never created

    app = create_app(token_path=str(token), client_secret_path=str(client_secret))
    response = TestClient(app).get("/tags")

    assert response.status_code == 401
    body = response.json()
    assert body["code"] == "AUTH_REQUIRED"
    # The message tells the user why auth cannot proceed and how to fix it.
    assert str(token) in body["message"]
    assert str(client_secret) in body["message"]
    # The bridge still starts and reports the error per-request without
    # ever touching simplegmail.
    assert "simplegmail" not in sys.modules
    assert TestClient(app).get("/health").status_code == 200


def test_story_verbose_logs_requests(caplog):
    client = TestClient(create_app(gmail_factory=FakeGmail, verbose=True))
    with caplog.at_level(logging.INFO, logger="bridge"):
        client.get("/health")
    assert any("/health" in record.getMessage() for record in caplog.records)


def test_story_logging_off_by_default(caplog):
    client = TestClient(create_app(gmail_factory=FakeGmail))
    with caplog.at_level(logging.INFO, logger="bridge"):
        client.get("/health")
    assert [r for r in caplog.records if r.name.startswith("bridge")] == []
