"""Stories: send and modify.

- POST /messages/send accepts {to, cc?, bcc?, subject, body_plain}, requires
  to/subject/body_plain, returns the sent message's message_id
- POST /messages/{message_id}/modify with a closed action set; tag_id
  required for tag actions and rejected otherwise
- all mutations expressed as Gmail label (tag) changes, never container moves
- trash only moves mail to Gmail's Trash; no endpoint deletes permanently
"""

import pytest
from fastapi.testclient import TestClient

from bridge.app import create_app
from fixtures import BOB, CAROL, DAVE, FakeGmail, FakeMessage


def make_client(gmail):
    return TestClient(create_app(gmail_factory=lambda: gmail))


def modify(gmail, message_id, payload):
    return make_client(gmail).post(f"/messages/{message_id}/modify", json=payload)


# --- POST /messages/send -------------------------------------------------------


def test_story_send_returns_sent_message_id_and_reaches_simplegmail():
    gmail = FakeGmail()
    gmail.sent_message = FakeMessage(id="sent-42", thread_id="t-sent")

    response = make_client(gmail).post(
        "/messages/send",
        json={
            "to": [BOB],
            "cc": [CAROL],
            "bcc": [DAVE],
            "subject": "Hi",
            "body_plain": "Hello there",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"message_id": "sent-42"}

    (kwargs,) = gmail.send_calls
    assert BOB in kwargs["to"]
    assert kwargs["cc"] == [CAROL]
    assert kwargs["bcc"] == [DAVE]
    assert kwargs["subject"] == "Hi"
    assert kwargs["msg_plain"] == "Hello there"


@pytest.mark.parametrize(
    "payload",
    [
        {"subject": "Hi", "body_plain": "Hello"},  # missing to
        {"to": [BOB], "body_plain": "Hello"},  # missing subject
        {"to": [BOB], "subject": "Hi"},  # missing body_plain
        {"to": [], "subject": "Hi", "body_plain": "Hello"},  # empty to
    ],
)
def test_story_send_requires_to_subject_and_body_plain(payload):
    gmail = FakeGmail()
    response = make_client(gmail).post("/messages/send", json=payload)
    assert response.status_code == 422
    assert gmail.send_calls == []


# --- POST /messages/{message_id}/modify ------------------------------------------


def make_inbox_message():
    return FakeMessage(id="m1", label_ids=["INBOX", "UNREAD"])


def test_story_modify_mark_read_removes_unread_label():
    msg = make_inbox_message()
    response = modify(FakeGmail(messages=[msg]), "m1", {"action": "mark_read"})
    assert response.status_code == 200
    assert msg.removed_labels == ["UNREAD"]
    assert msg.added_labels == []


def test_story_modify_mark_unread_adds_unread_label():
    msg = make_inbox_message()
    response = modify(FakeGmail(messages=[msg]), "m1", {"action": "mark_unread"})
    assert response.status_code == 200
    assert msg.added_labels == ["UNREAD"]
    assert msg.removed_labels == []


def test_story_modify_add_tag_adds_the_given_label():
    msg = make_inbox_message()
    response = modify(
        FakeGmail(messages=[msg]), "m1", {"action": "add_tag", "tag_id": "Label_7"}
    )
    assert response.status_code == 200
    assert msg.added_labels == ["Label_7"]
    assert msg.removed_labels == []


def test_story_modify_remove_tag_removes_the_given_label():
    msg = make_inbox_message()
    response = modify(
        FakeGmail(messages=[msg]), "m1", {"action": "remove_tag", "tag_id": "Label_7"}
    )
    assert response.status_code == 200
    assert msg.removed_labels == ["Label_7"]
    assert msg.added_labels == []


def test_story_modify_archive_is_only_the_inbox_label_removal():
    msg = make_inbox_message()
    response = modify(FakeGmail(messages=[msg]), "m1", {"action": "archive"})
    assert response.status_code == 200
    assert msg.removed_labels == ["INBOX"]  # a label change...
    assert msg.added_labels == []  # ...never a move between containers
    assert msg.trash_calls == 0


def test_story_modify_trash_only_moves_to_gmail_trash():
    msg = make_inbox_message()
    response = modify(FakeGmail(messages=[msg]), "m1", {"action": "trash"})
    assert response.status_code == 200
    assert msg.trash_calls == 1
    assert msg.added_labels == []
    assert msg.removed_labels == []


@pytest.mark.parametrize("action", ["delete", "move", "mark_spam", ""])
def test_story_modify_rejects_actions_outside_the_closed_set(action):
    msg = make_inbox_message()
    response = modify(FakeGmail(messages=[msg]), "m1", {"action": action})
    assert response.status_code == 422
    assert msg.added_labels == []
    assert msg.removed_labels == []
    assert msg.trash_calls == 0


@pytest.mark.parametrize("action", ["add_tag", "remove_tag"])
def test_story_modify_tag_actions_require_tag_id(action):
    msg = make_inbox_message()
    response = modify(FakeGmail(messages=[msg]), "m1", {"action": action})
    assert response.status_code == 422
    assert msg.added_labels == []
    assert msg.removed_labels == []


@pytest.mark.parametrize("action", ["mark_read", "mark_unread", "archive", "trash"])
def test_story_modify_rejects_tag_id_on_non_tag_actions(action):
    msg = make_inbox_message()
    response = modify(
        FakeGmail(messages=[msg]), "m1", {"action": action, "tag_id": "Label_7"}
    )
    assert response.status_code == 422
    assert msg.added_labels == []
    assert msg.removed_labels == []
    assert msg.trash_calls == 0


def test_story_no_endpoint_deletes_permanently():
    app = create_app(gmail_factory=FakeGmail)
    methods = set()
    for route in app.routes:
        methods |= getattr(route, "methods", None) or set()
    assert "DELETE" not in methods
