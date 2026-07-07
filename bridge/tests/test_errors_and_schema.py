"""Stories: error mapping and the exact snake_case wire schema.

- Gmail/simplegmail exceptions mapped to {code, message} with code from
  AUTH_REQUIRED | NOT_FOUND | RATE_LIMITED | PROVIDER_ERROR and HTTP status
  401/404/429/502
- request-validation failures returned as the same {code, message} body
  (code PROVIDER_ERROR, HTTP 422) — never FastAPI's default {detail: [...]}
- all response JSON in snake_case exactly matching the spec's Output Schema
"""

import pytest
from fastapi.testclient import TestClient

from bridge.app import create_app
from fixtures import FakeGmail, FakeHttpError, FakeLabel, FakeMessage, inbox_gmail


def make_client(gmail):
    return TestClient(create_app(gmail_factory=lambda: gmail))


# --- error mapping ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("gmail_status", "code", "http_status"),
    [
        (401, "AUTH_REQUIRED", 401),
        (404, "NOT_FOUND", 404),
        (429, "RATE_LIMITED", 429),
        (500, "PROVIDER_ERROR", 502),
    ],
)
def test_story_gmail_http_errors_map_to_codes_and_statuses(gmail_status, code, http_status):
    gmail = FakeGmail(labels=[FakeLabel("INBOX", "INBOX")])
    gmail.list_labels_error = FakeHttpError(gmail_status)

    response = make_client(gmail).get("/tags")

    assert response.status_code == http_status
    body = response.json()
    assert set(body) == {"code", "message"}
    assert body["code"] == code
    assert isinstance(body["message"], str) and body["message"]


def test_story_non_http_exceptions_map_to_provider_error_502():
    gmail = FakeGmail()
    gmail.list_labels_error = RuntimeError("socket exploded")

    response = make_client(gmail).get("/tags")

    assert response.status_code == 502
    assert response.json()["code"] == "PROVIDER_ERROR"


def test_story_unknown_message_maps_to_not_found():
    response = make_client(FakeGmail()).get("/messages/does-not-exist")
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


def test_story_unknown_thread_maps_to_not_found():
    response = make_client(inbox_gmail()).get("/threads/does-not-exist")
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


# --- request-validation failures use the same wire error schema ---------------------


def assert_wire_error_422(response, mentioning):
    assert response.status_code == 422
    body = response.json()
    assert set(body) == {"code", "message"}  # never FastAPI's {detail: [...]}
    assert body["code"] == "PROVIDER_ERROR"
    assert mentioning in body["message"]  # the diagnostic detail survives


def test_story_validation_failure_on_page_size_uses_wire_error_schema():
    response = make_client(inbox_gmail()).get(
        "/threads", params={"tag": "INBOX", "page_size": 200}
    )
    assert_wire_error_422(response, "page_size")


def test_story_validation_failure_on_send_body_uses_wire_error_schema():
    gmail = FakeGmail()
    response = make_client(gmail).post(
        "/messages/send", json={"to": [], "subject": "S", "body_plain": "B"}
    )
    assert_wire_error_422(response, "to")
    assert gmail.send_calls == []


def test_story_validation_failure_on_modify_body_uses_wire_error_schema():
    msg = FakeMessage(id="m1")
    response = make_client(FakeGmail(messages=[msg])).post(
        "/messages/m1/modify", json={"action": "add_tag"}
    )
    assert_wire_error_422(response, "tag_id")
    assert msg.added_labels == []


# --- exact snake_case wire schema ---------------------------------------------------


def test_story_wire_schema_tag_is_snake_case_exact():
    tags = make_client(inbox_gmail()).get("/tags").json()
    for tag in tags:
        assert {"tag_id", "name"} <= set(tag) <= {"tag_id", "name", "unread_count"}
        assert isinstance(tag["tag_id"], str)
        assert isinstance(tag["name"], str)


def test_story_wire_schema_thread_list_and_thread_summary_are_snake_case_exact():
    body = make_client(inbox_gmail()).get("/threads", params={"tag": "INBOX"}).json()

    assert set(body) <= {"threads", "next_page_token"}
    assert "threads" in body

    for summary in body["threads"]:
        assert set(summary) == {
            "thread_id",
            "subject",
            "snippet",
            "from",
            "date",
            "unread",
            "message_count",
            "tag_ids",
        }
        assert isinstance(summary["thread_id"], str)
        assert isinstance(summary["subject"], str)
        assert isinstance(summary["snippet"], str)
        assert isinstance(summary["from"], str)
        assert isinstance(summary["date"], int)
        assert isinstance(summary["unread"], bool)
        assert isinstance(summary["message_count"], int)
        assert isinstance(summary["tag_ids"], list)
        assert all(isinstance(tag_id, str) for tag_id in summary["tag_ids"])


def test_story_wire_schema_message_is_snake_case_exact():
    message = make_client(inbox_gmail()).get("/messages/m1").json()

    required = {
        "message_id",
        "thread_id",
        "from",
        "to",
        "cc",
        "bcc",
        "subject",
        "date",
        "unread",
        "tag_ids",
    }
    assert required <= set(message) <= required | {"body_plain", "body_html"}
    assert isinstance(message["message_id"], str)
    assert isinstance(message["thread_id"], str)
    assert isinstance(message["from"], str)
    assert isinstance(message["to"], list)
    assert isinstance(message["cc"], list)
    assert isinstance(message["bcc"], list)
    assert isinstance(message["subject"], str)
    assert isinstance(message["date"], int)
    assert isinstance(message["unread"], bool)
    assert isinstance(message["tag_ids"], list)


def test_story_wire_schema_send_result_is_snake_case_exact():
    gmail = FakeGmail()
    gmail.sent_message = FakeMessage(id="sent-9", thread_id="t-sent")
    response = make_client(gmail).post(
        "/messages/send",
        json={"to": ["bob@example.com"], "subject": "S", "body_plain": "B"},
    )
    assert response.json() == {"message_id": "sent-9"}


def test_story_wire_schema_error_is_snake_case_exact():
    gmail = FakeGmail()
    gmail.list_labels_error = FakeHttpError(429, "slow down")
    body = make_client(gmail).get("/tags").json()
    assert set(body) == {"code", "message"}
    assert body["code"] in {"AUTH_REQUIRED", "NOT_FOUND", "RATE_LIMITED", "PROVIDER_ERROR"}
