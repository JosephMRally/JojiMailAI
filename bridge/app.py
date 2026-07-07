"""JojiMailAI Gmail bridge — a localhost FastAPI facade over `simplegmail`.

The server-side half of the Gmail proxy (spec:
user-stories/python_gmail_bridge.md). The app-side GmailProvider delegates
here over HTTP; this process owns all Gmail I/O — OAuth, paging, label
changes, send — and speaks the snake_case wire schema.

Do not run against a live mailbox in tests: build the app with
`create_app(gmail_factory=...)` and drive it through fastapi.testclient.
`simplegmail` is imported lazily inside the default factory only.
"""

from __future__ import annotations

import argparse
import logging
import os
from contextlib import contextmanager
from email.utils import parsedate_to_datetime
from typing import Literal, Optional

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, model_validator

DEFAULT_HOST = "127.0.0.1"  # loopback only: never reachable off the device
DEFAULT_PORT = 8765
DEFAULT_TOKEN_PATH = "~/gmail-token.json"
DEFAULT_CLIENT_SECRET_PATH = "~/client_secret.json"

logger = logging.getLogger("bridge")

_STATUS_BY_CODE = {
    "AUTH_REQUIRED": 401,
    "NOT_FOUND": 404,
    "RATE_LIMITED": 429,
    "PROVIDER_ERROR": 502,
}
# Gmail HTTP statuses worth distinguishing; everything else is PROVIDER_ERROR.
_CODE_BY_GMAIL_STATUS = {401: "AUTH_REQUIRED", 404: "NOT_FOUND", 429: "RATE_LIMITED"}

_TAG_ACTIONS = frozenset({"add_tag", "remove_tag"})


class BridgeError(Exception):
    """Normalized bridge error: wire body {code, message} + HTTP status."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        self.status = _STATUS_BY_CODE[code]
        super().__init__(message)


@contextmanager
def _gmail_errors():
    """Map Gmail/simplegmail exceptions to BridgeError (401/404/429/502)."""
    try:
        yield
    except BridgeError:
        raise
    except Exception as exc:  # noqa: BLE001 - every provider error must map
        status = getattr(getattr(exc, "resp", None), "status", None)
        code = _CODE_BY_GMAIL_STATUS.get(status, "PROVIDER_ERROR")
        raise BridgeError(code, str(exc) or code) from exc


def _default_gmail_factory(token_path: str, client_secret_path: str):
    """Factory for the real `simplegmail` client (JosephMRally fork).

    `simplegmail` is imported lazily so the bridge starts — and tests run —
    without the package or credentials; a valid saved token is reused by
    passing both files to the Gmail constructor.
    """
    token = os.path.expanduser(token_path)
    client_secret = os.path.expanduser(client_secret_path)

    def factory():
        if not os.path.exists(token) and not os.path.exists(client_secret):
            raise BridgeError(
                "AUTH_REQUIRED",
                "Cannot authenticate with Gmail: no saved token at "
                f"{token} and no OAuth client at {client_secret}. "
                "Provide --token/--client-secret, or place an OAuth client "
                "JSON at the client-secret path and run the bridge once in "
                "an environment with a browser to complete Google sign-in "
                "and create the reusable token.",
            )
        from simplegmail import Gmail  # lazy: only on the first request that needs Gmail

        return Gmail(client_secret_file=client_secret, creds_file=token)

    return factory


# --- wire serialization ------------------------------------------------------


def _derive_date(msg) -> int:
    """One canonical epoch-ms date: internalDate/internal_date first, else
    parse headerDate/header_date, else 0."""
    internal = getattr(msg, "internalDate", None)
    if internal is None:
        internal = getattr(msg, "internal_date", None)
    if internal is not None:
        return int(internal)
    header = getattr(msg, "headerDate", None)
    if header is None:
        header = getattr(msg, "header_date", None)
    if header:
        try:
            return int(parsedate_to_datetime(header).timestamp() * 1000)
        except (TypeError, ValueError):
            pass
    return 0


def _as_str(value) -> str:
    return value or ""


def _as_list(value) -> list:
    if not value:
        return []
    if isinstance(value, str):
        return [value]
    return list(value)


def _tag_ids(msg) -> list:
    return _as_list(getattr(msg, "label_ids", None))


def _is_unread(msg) -> bool:
    return "UNREAD" in _tag_ids(msg)


def _wire_message(msg) -> dict:
    wire = {
        "message_id": msg.id,
        "thread_id": msg.thread_id,
        "from": _as_str(getattr(msg, "sender", None)),
        "to": _as_list(getattr(msg, "recipient", None)),
        "cc": _as_list(getattr(msg, "cc", None)),
        "bcc": _as_list(getattr(msg, "bcc", None)),
        "subject": _as_str(getattr(msg, "subject", None)),
        "date": _derive_date(msg),
        "unread": _is_unread(msg),
        "tag_ids": _tag_ids(msg),
    }
    plain = getattr(msg, "plain", None)
    if plain is not None:
        wire["body_plain"] = plain
    html = getattr(msg, "html", None)
    if html is not None:
        wire["body_html"] = html
    return wire


def _hydrate(gmail, refs) -> list:
    """Turn Gmail message refs into simplegmail Message objects (all MIME
    parsing stays inside the fork)."""
    if not refs:
        return []
    return gmail._get_messages_from_refs("me", refs, "reference")


def _thread_summaries(messages) -> list:
    """Group a page of messages into thread summaries, first-seen order;
    subject/snippet/from/date come from the newest message in the thread."""
    by_thread: dict = {}
    for msg in messages:
        by_thread.setdefault(msg.thread_id, []).append(msg)

    summaries = []
    for thread_id, msgs in by_thread.items():
        newest = max(msgs, key=_derive_date)
        tag_ids: list = []
        for msg in msgs:
            for tag_id in _tag_ids(msg):
                if tag_id not in tag_ids:
                    tag_ids.append(tag_id)
        summaries.append(
            {
                "thread_id": thread_id,
                "subject": _as_str(getattr(newest, "subject", None)),
                "snippet": _as_str(getattr(newest, "snippet", None)),
                "from": _as_str(getattr(newest, "sender", None)),
                "date": _derive_date(newest),
                "unread": any(_is_unread(m) for m in msgs),
                "message_count": len(msgs),
                "tag_ids": tag_ids,
            }
        )
    return summaries


# --- request bodies ------------------------------------------------------------


class SendRequest(BaseModel):
    to: list[str] = Field(min_length=1)
    cc: Optional[list[str]] = None
    bcc: Optional[list[str]] = None
    subject: str
    body_plain: str


ModifyAction = Literal[
    "mark_read", "mark_unread", "add_tag", "remove_tag", "archive", "trash"
]


class ModifyRequest(BaseModel):
    action: ModifyAction
    tag_id: Optional[str] = None

    @model_validator(mode="after")
    def _tag_id_only_for_tag_actions(self):
        if self.action in _TAG_ACTIONS and not self.tag_id:
            raise ValueError(f"tag_id is required for action {self.action!r}")
        if self.action not in _TAG_ACTIONS and self.tag_id is not None:
            raise ValueError(f"tag_id is not allowed for action {self.action!r}")
        return self


# --- app factory -----------------------------------------------------------------


def create_app(
    gmail_factory=None,
    token_path: Optional[str] = None,
    client_secret_path: Optional[str] = None,
    verbose: bool = False,
) -> FastAPI:
    """Build the bridge app. Tests inject `gmail_factory`; by default the
    real simplegmail client is constructed lazily on the first request
    that needs Gmail (never at process start)."""
    if gmail_factory is None:
        gmail_factory = _default_gmail_factory(
            token_path or DEFAULT_TOKEN_PATH,
            client_secret_path or DEFAULT_CLIENT_SECRET_PATH,
        )

    app = FastAPI(title="JojiMailAI Gmail bridge")
    state = {"gmail": None}

    def gmail():
        if state["gmail"] is None:
            with _gmail_errors():
                state["gmail"] = gmail_factory()
        return state["gmail"]

    def fetch_message(g, message_id: str):
        messages = _hydrate(g, [{"id": message_id}])
        if not messages:
            raise BridgeError("NOT_FOUND", f"message {message_id!r} not found")
        return messages[0]

    @app.exception_handler(BridgeError)
    async def bridge_error_handler(request: Request, exc: BridgeError):
        return JSONResponse(
            status_code=exc.status, content={"code": exc.code, "message": exc.message}
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        # Same wire error schema as every other failure — never FastAPI's
        # default {detail: [...]} — so the proxy keeps the diagnostic detail.
        detail = "; ".join(
            "{}: {}".format(
                ".".join(str(part) for part in err.get("loc", ())),
                err.get("msg", "invalid"),
            )
            for err in exc.errors()
        )
        return JSONResponse(
            status_code=422,
            content={"code": "PROVIDER_ERROR", "message": f"invalid request: {detail}"},
        )

    if verbose:

        @app.middleware("http")
        async def log_requests(request: Request, call_next):
            response = await call_next(request)
            logger.info(
                "%s %s -> %s", request.method, request.url.path, response.status_code
            )
            return response

    @app.get("/health")
    def health():
        # No Gmail call: detects a running bridge without triggering OAuth.
        return {"status": "ok"}

    @app.get("/tags")
    def list_tags():
        with _gmail_errors():
            labels = gmail().list_labels()
        # Gmail is tag-native: labels pass through as a flat list.
        return [{"tag_id": label.id, "name": label.name} for label in labels]

    @app.get("/threads")
    def list_threads(
        tag: str = Query(...),
        page_token: Optional[str] = None,
        page_size: int = Query(25, ge=1, le=100),
    ):
        with _gmail_errors():
            g = gmail()
            # Gmail's own page token passes through opaquely.
            page = (
                g.service.users()
                .messages()
                .list(
                    userId="me",
                    labelIds=[tag],
                    maxResults=page_size,
                    pageToken=page_token,
                )
                .execute()
            )
            messages = _hydrate(g, page.get("messages", []))
        body = {"threads": _thread_summaries(messages)}
        next_token = page.get("nextPageToken")
        if next_token:
            body["next_page_token"] = next_token
        return body

    @app.get("/threads/{thread_id}")
    def get_thread(thread_id: str):
        with _gmail_errors():
            g = gmail()
            thread = (
                g.service.users().threads().get(userId="me", id=thread_id).execute()
            )
            refs = [{"id": ref["id"]} for ref in thread.get("messages", [])]
            messages = _hydrate(g, refs)
        messages = sorted(messages, key=_derive_date)  # oldest-first
        return [_wire_message(msg) for msg in messages]

    @app.get("/messages/{message_id}")
    def get_message(message_id: str):
        with _gmail_errors():
            msg = fetch_message(gmail(), message_id)
        return _wire_message(msg)

    @app.post("/messages/send")
    def send_message(body: SendRequest):
        with _gmail_errors():
            sent = gmail().send_message(
                sender="me",
                to=", ".join(body.to),
                cc=body.cc,
                bcc=body.bcc,
                subject=body.subject,
                msg_plain=body.body_plain,
            )
        return {"message_id": sent.id}

    @app.post("/messages/{message_id}/modify")
    def modify_message(message_id: str, body: ModifyRequest):
        # Every mutation is a Gmail label (tag) change — never a container
        # move — and trash only moves to Gmail's Trash (reversible there).
        with _gmail_errors():
            msg = fetch_message(gmail(), message_id)
            if body.action == "mark_read":
                msg.remove_label("UNREAD")
            elif body.action == "mark_unread":
                msg.add_label("UNREAD")
            elif body.action == "add_tag":
                msg.add_label(body.tag_id)
            elif body.action == "remove_tag":
                msg.remove_label(body.tag_id)
            elif body.action == "archive":
                msg.remove_label("INBOX")
            elif body.action == "trash":
                msg.trash()
        return {"status": "ok"}

    return app


# --- CLI ---------------------------------------------------------------------------


def parse_args(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="bridge",
        description="Localhost HTTP facade over simplegmail (JojiMailAI Gmail bridge).",
    )
    parser.add_argument(
        "--port", type=int, default=DEFAULT_PORT, help=f"listen port (default {DEFAULT_PORT})"
    )
    parser.add_argument(
        "--token",
        default=os.path.expanduser(DEFAULT_TOKEN_PATH),
        help=f"saved OAuth token location (default {DEFAULT_TOKEN_PATH})",
    )
    parser.add_argument(
        "--client-secret",
        dest="client_secret",
        default=os.path.expanduser(DEFAULT_CLIENT_SECRET_PATH),
        help=f"OAuth client JSON location (default {DEFAULT_CLIENT_SECRET_PATH})",
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true", help="log requests (off by default)"
    )
    return parser.parse_args(argv)


def main(argv=None) -> None:
    args = parse_args(argv)
    if args.verbose:
        logging.basicConfig(level=logging.INFO)
    app = create_app(
        token_path=args.token,
        client_secret_path=args.client_secret,
        verbose=args.verbose,
    )
    import uvicorn  # lazy: tests never start a server

    uvicorn.run(app, host=DEFAULT_HOST, port=args.port)


if __name__ == "__main__":
    main()
