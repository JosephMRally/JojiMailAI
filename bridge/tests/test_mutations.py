"""Stories: send and modify.

- POST /messages/send accepts {to, cc?, bcc?, subject, body_plain}, requires
  to/subject/body_plain, returns the sent message's message_id
- POST /messages/{message_id}/modify with a closed action set; tag_id
  required for tag actions and rejected otherwise
- POST /threads/{thread_id}/modify with {action} from archive | trash,
  applied to every message in the thread; 404 for an unknown thread
- all mutations expressed as Gmail label (tag) changes, never container moves
- trash only moves mail to Gmail's Trash; no endpoint deletes permanently
"""

import pytest
from fastapi.testclient import TestClient

from bridge.app import create_app
from fixtures import BOB, CAROL, DAVE, FakeGmail, FakeMessage, inbox_gmail


def make_client(gmail):
    return TestClient(create_app(gmail_factory=lambda: gmail))


def modify(gmail, message_id, payload):
    return make_client(gmail).post(f"/messages/{message_id}/modify", json=payload)


def modify_thread(gmail, thread_id, payload):
    return make_client(gmail).post(f"/threads/{thread_id}/modify", json=payload)


def make_two_message_thread():
    """A two-message thread, both carrying INBOX, reachable via threads().get."""
    m1 = FakeMessage(id="m1", thread_id="t1", label_ids=["INBOX", "UNREAD"])
    m3 = FakeMessage(id="m3", thread_id="t1", label_ids=["INBOX"])
    gmail = FakeGmail(
        messages=[m1, m3],
        thread_gets={"t1": {"id": "t1", "messages": [{"id": "m1"}, {"id": "m3"}]}},
    )
    return gmail, m1, m3


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


# --- POST /threads/{thread_id}/modify ---------------------------------------------


def test_story_thread_archive_removes_inbox_from_every_message_in_the_thread():
    gmail, m1, m3 = make_two_message_thread()
    response = modify_thread(gmail, "t1", {"action": "archive"})
    assert response.status_code == 200
    assert m1.removed_labels == ["INBOX"]  # a label change on every message...
    assert m3.removed_labels == ["INBOX"]
    assert m1.added_labels == [] and m3.added_labels == []  # ...never a move
    assert m1.trash_calls == 0 and m3.trash_calls == 0


def test_story_thread_trash_trashes_every_message_in_the_thread():
    gmail, m1, m3 = make_two_message_thread()
    response = modify_thread(gmail, "t1", {"action": "trash"})
    assert response.status_code == 200
    assert m1.trash_calls == 1 and m3.trash_calls == 1  # Gmail Trash only
    assert m1.added_labels == [] and m3.added_labels == []
    assert m1.removed_labels == [] and m3.removed_labels == []


def test_story_thread_modify_unknown_thread_maps_to_not_found():
    response = modify_thread(inbox_gmail(), "no-such-thread", {"action": "archive"})
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


@pytest.mark.parametrize("action", ["mark_read", "add_tag", "delete", ""])
def test_story_thread_modify_rejects_actions_outside_archive_trash(action):
    gmail, m1, m3 = make_two_message_thread()
    response = modify_thread(gmail, "t1", {"action": action})
    assert response.status_code == 422
    for msg in (m1, m3):
        assert msg.added_labels == []
        assert msg.removed_labels == []
        assert msg.trash_calls == 0


def test_story_no_endpoint_deletes_permanently():
    app = create_app(gmail_factory=FakeGmail)
    methods = set()
    for route in app.routes:
        methods |= getattr(route, "methods", None) or set()
    assert "DELETE" not in methods
