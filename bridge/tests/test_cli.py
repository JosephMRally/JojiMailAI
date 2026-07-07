"""Stories: CLI flags and exit codes.

- server binds 127.0.0.1 only, port from --port (default 8765)
- --token PATH overrides ~/gmail-token.json
- --client-secret PATH overrides ~/client_secret.json
- -v/--verbose flag, off by default
- python args and exit codes (non-zero exit on bad flags)
"""

import os
import sys
import types

import pytest

import bridge.app as bridge_app
from bridge.app import DEFAULT_HOST, parse_args


def test_story_port_flag_with_default_8765():
    assert parse_args([]).port == 8765
    assert parse_args(["--port", "9001"]).port == 9001


def test_story_server_binds_loopback_only(monkeypatch, tmp_path):
    runs = []
    fake_uvicorn = types.ModuleType("uvicorn")
    fake_uvicorn.run = lambda app, **kwargs: runs.append((app, kwargs))
    monkeypatch.setitem(sys.modules, "uvicorn", fake_uvicorn)

    bridge_app.main(
        [
            "--port", "9001",
            "--token", str(tmp_path / "gmail-token.json"),
            "--client-secret", str(tmp_path / "client_secret.json"),
        ]
    )

    assert DEFAULT_HOST == "127.0.0.1"
    ((_, kwargs),) = runs
    assert kwargs["host"] == "127.0.0.1"
    assert kwargs["port"] == 9001


def test_story_main_plumbs_token_client_secret_and_verbose_into_create_app(monkeypatch):
    """The override flags must actually reach create_app — parse_args tests
    alone would pass even if main() dropped them for the defaults."""
    runs = []
    fake_uvicorn = types.ModuleType("uvicorn")
    fake_uvicorn.run = lambda app, **kwargs: runs.append((app, kwargs))
    monkeypatch.setitem(sys.modules, "uvicorn", fake_uvicorn)

    created = []
    sentinel = object()

    def fake_create_app(**kwargs):
        created.append(kwargs)
        return sentinel

    monkeypatch.setattr(bridge_app, "create_app", fake_create_app)

    bridge_app.main(
        [
            "--token", "/somewhere/else/tok.json",
            "--client-secret", "/somewhere/else/cs.json",
            "--verbose",
        ]
    )

    assert created == [
        {
            "token_path": "/somewhere/else/tok.json",
            "client_secret_path": "/somewhere/else/cs.json",
            "verbose": True,
        }
    ]
    ((served_app, _),) = runs
    assert served_app is sentinel  # uvicorn serves the app built from the flags


def test_story_token_flag_overrides_default_home_location():
    assert parse_args([]).token == os.path.expanduser("~/gmail-token.json")
    assert parse_args(["--token", "/somewhere/else/tok.json"]).token == "/somewhere/else/tok.json"


def test_story_client_secret_flag_overrides_default_home_location():
    assert parse_args([]).client_secret == os.path.expanduser("~/client_secret.json")
    assert (
        parse_args(["--client-secret", "/somewhere/else/cs.json"]).client_secret
        == "/somewhere/else/cs.json"
    )


def test_story_verbose_flag_off_by_default():
    assert parse_args([]).verbose is False
    assert parse_args(["-v"]).verbose is True
    assert parse_args(["--verbose"]).verbose is True


@pytest.mark.parametrize("argv", [["--port", "not-a-number"], ["--no-such-flag"]])
def test_story_bad_flags_exit_nonzero(argv):
    with pytest.raises(SystemExit) as excinfo:
        parse_args(argv)
    assert excinfo.value.code not in (0, None)
