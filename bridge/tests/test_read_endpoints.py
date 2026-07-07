"""Stories: read endpoints.

- GET /tags returns Gmail labels as a flat tag list (no folder semantics)
- GET /threads?tag=ID&page_token=T&page_size=N (1-100, default 25) with
  opaque passthrough of Gmail's own page token
- GET /threads/{thread_id} returns messages oldest-first;
  GET /messages/{message_id} returns one full message
- date derived from internalDate (epoch ms), accepting internal_date,
  falling back to parsing headerDate / header_date
- sender is a string; recipient/cc/bcc are lists (any may be empty/None)
- bodies returned as body_plain/body_html, omitting whichever is absent
"""

from fastapi.testclient import TestClient

from bridge.app import create_app
from fixtures import ALICE, BOB, CAROL, DAVE, FakeGmail, FakeMessage, inbox_gmail, use_snake_date_attrs


def make_client(gmail):
    return TestClient(create_app(gmail_factory=lambda: gmail))


def get_message(msg):
    """Serve a single fixture message through the bridge and return its wire JSON."""
    response = make_client(FakeGmail(messages=[msg])).get(f"/messages/{msg.id}")
    assert response.status_code == 200
    return response.json()


# --- GET /tags ---------------------------------------------------------------


def test_story_tags_returns_gmail_labels_as_flat_tag_list():
    response = make_client(inbox_gmail()).get("/tags")
    assert response.status_code == 200
    assert response.json() == [
        {"tag_id": "INBOX", "name": "INBOX"},
        {"tag_id": "Label_7", "name": "Receipts"},
    ]


# --- GET /threads ------------------------------------------------------------


def test_story_threads_returns_summaries_for_tag_with_next_page_token():
    gmail = inbox_gmail()
    response = make_client(gmail).get("/threads", params={"tag": "INBOX"})

    assert response.status_code == 200
    body = response.json()
    assert body["next_page_token"] == "tok2"

    threads = body["threads"]
    assert [t["thread_id"] for t in threads] == ["t1", "t2"]

    t1 = threads[0]
    assert t1["subject"] == "Lunch?"
    assert t1["snippet"] == "latest in t1"  # newest message wins
    assert t1["from"] == ALICE
    assert t1["date"] == 3000
    assert t1["unread"] is True
    assert t1["message_count"] == 2
    assert sorted(t1["tag_ids"]) == ["INBOX", "UNREAD"]

    t2 = threads[1]
    assert t2["unread"] is False
    assert t2["message_count"] == 1

    # The bridge asked Gmail for that tag with the default page size.
    (list_kwargs,) = gmail.service.list_calls
    assert list_kwargs["labelIds"] == ["INBOX"]
    assert list_kwargs["maxResults"] == 25
    assert list_kwargs.get("pageToken") is None


def test_story_threads_passes_gmails_own_page_token_through_opaquely():
    gmail = inbox_gmail()
    response = make_client(gmail).get(
        "/threads", params={"tag": "INBOX", "page_token": "tok2", "page_size": 50}
    )

    assert response.status_code == 200
    body = response.json()
    assert [t["thread_id"] for t in body["threads"]] == ["t3"]
    assert "next_page_token" not in body  # last page

    (list_kwargs,) = gmail.service.list_calls
    assert list_kwargs["pageToken"] == "tok2"
    assert list_kwargs["maxResults"] == 50


def test_story_threads_page_size_validated_1_to_100():
    client = make_client(inbox_gmail())
    assert client.get("/threads", params={"tag": "INBOX", "page_size": 0}).status_code == 422
    assert client.get("/threads", params={"tag": "INBOX", "page_size": 101}).status_code == 422


def test_story_threads_requires_tag_param():
    assert make_client(inbox_gmail()).get("/threads").status_code == 422


def test_story_threads_empty_mailbox_returns_empty_page():
    gmail = FakeGmail(list_pages={None: {}})
    body = make_client(gmail).get("/threads", params={"tag": "INBOX"}).json()
    assert body["threads"] == []
    assert "next_page_token" not in body


# --- GET /threads/{thread_id} and GET /messages/{message_id} ------------------


def test_story_get_thread_returns_messages_oldest_first():
    response = make_client(inbox_gmail()).get("/threads/t1")

    assert response.status_code == 200
    messages = response.json()
    assert [m["message_id"] for m in messages] == ["m3", "m1"]
    assert [m["date"] for m in messages] == [1000, 3000]
    assert all(m["thread_id"] == "t1" for m in messages)


def test_story_get_message_returns_one_full_message():
    response = make_client(inbox_gmail()).get("/messages/m2")

    assert response.status_code == 200
    message = response.json()
    assert message["message_id"] == "m2"
    assert message["thread_id"] == "t2"
    assert message["from"] == CAROL
    assert message["to"] == [BOB]
    assert message["subject"] == "Invoice"
    assert message["date"] == 2000
    assert message["unread"] is False
    assert message["tag_ids"] == ["INBOX"]


# --- canonical date derivation -------------------------------------------------


def test_story_date_prefers_internal_date_epoch_ms_over_header_date():
    msg = FakeMessage(
        id="md1",
        internalDate=1_700_000_000_123,
        headerDate="Thu, 02 Nov 2023 12:00:00 +0000",  # would disagree
    )
    assert get_message(msg)["date"] == 1_700_000_000_123


def test_story_date_falls_back_to_parsing_header_date_when_internal_missing():
    msg = FakeMessage(
        id="md2", internalDate=None, headerDate="Thu, 02 Nov 2023 12:00:00 +0000"
    )
    assert get_message(msg)["date"] == 1_698_926_400_000


def test_story_date_accepts_snake_case_internal_date_attribute():
    msg = use_snake_date_attrs(FakeMessage(id="md3"), internal_date=4200)
    assert get_message(msg)["date"] == 4200


def test_story_date_accepts_snake_case_header_date_attribute():
    msg = use_snake_date_attrs(
        FakeMessage(id="md4"), header_date="Thu, 02 Nov 2023 12:00:00 +0000"
    )
    assert get_message(msg)["date"] == 1_698_926_400_000


def test_story_date_is_one_canonical_integer_even_with_no_dates_at_all():
    msg = FakeMessage(id="md5", internalDate=None, headerDate=None)
    assert get_message(msg)["date"] == 0


# --- addresses -----------------------------------------------------------------


def test_story_sender_is_string_and_recipient_cc_bcc_are_lists():
    msg = FakeMessage(id="ma1", sender=ALICE, recipient=[BOB, CAROL], cc=[DAVE], bcc=[])
    wire = get_message(msg)
    assert wire["from"] == ALICE
    assert wire["to"] == [BOB, CAROL]
    assert wire["cc"] == [DAVE]
    assert wire["bcc"] == []


def test_story_none_sender_and_none_recipient_lists_become_empty():
    msg = FakeMessage(id="ma2", sender=None, recipient=None, cc=None, bcc=None)
    wire = get_message(msg)
    assert wire["from"] == ""
    assert wire["to"] == []
    assert wire["cc"] == []
    assert wire["bcc"] == []


# --- bodies ----------------------------------------------------------------------


def test_story_bodies_include_both_plain_and_html_when_present():
    msg = FakeMessage(id="mb1", plain="hello", html="<p>hello</p>")
    wire = get_message(msg)
    assert wire["body_plain"] == "hello"
    assert wire["body_html"] == "<p>hello</p>"


def test_story_bodies_omit_body_html_when_absent():
    wire = get_message(FakeMessage(id="mb2", plain="plain only", html=None))
    assert wire["body_plain"] == "plain only"
    assert "body_html" not in wire


def test_story_bodies_omit_body_plain_when_absent():
    wire = get_message(FakeMessage(id="mb3", plain=None, html="<p>html only</p>"))
    assert wire["body_html"] == "<p>html only</p>"
    assert "body_plain" not in wire
