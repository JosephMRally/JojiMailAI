"""Deterministic fakes for bridge tests.

Story: "tests to mock the simplegmail Gmail client" and "test fixtures
modeled on the shape of real simplegmail Message objects, using fake
addresses". The shapes mirror the JosephMRally simplegmail fork:

- Message attributes: id, thread_id, sender (str), recipient/cc/bcc (lists),
  subject, snippet, plain, html, label_ids, internalDate (Optional[int],
  epoch ms), headerDate (str), plus label/trash mutation methods.
- Label attributes: name, id.
- Gmail surface used by the bridge: list_labels(), send_message(),
  _get_messages_from_refs(), and the raw .service resource for
  users().messages().list / users().threads().get (page tokens).
- HttpError carries .resp.status like googleapiclient.errors.HttpError.

No real addresses: everything lives under example.com.
"""

from types import SimpleNamespace

ALICE = "Alice Example <alice@example.com>"
BOB = "bob@example.com"
CAROL = "carol@example.com"
DAVE = "dave@example.com"

_UNSET = object()


class FakeHttpError(Exception):
    """Mirror of googleapiclient.errors.HttpError: status lives at .resp.status."""

    def __init__(self, status, reason="fake gmail http error"):
        self.resp = SimpleNamespace(status=status, reason=reason)
        super().__init__(f"<FakeHttpError {status} {reason!r}>")


class FakeLabel:
    """Mirror of simplegmail.label.Label."""

    def __init__(self, name, id):
        self.name = name
        self.id = id


class FakeMessage:
    """Mirror of the fork's simplegmail.message.Message attribute shape,
    recording label/trash mutations instead of calling Gmail."""

    def __init__(
        self,
        id="m1",
        thread_id="t1",
        sender=_UNSET,
        recipient=_UNSET,
        cc=_UNSET,
        bcc=_UNSET,
        subject="Subject",
        snippet="Snippet",
        plain="Plain body",
        html=None,
        label_ids=_UNSET,
        internalDate=1_700_000_000_000,
        headerDate="Tue, 14 Nov 2023 22:13:20 +0000",
    ):
        self.id = id
        self.thread_id = thread_id
        self.sender = ALICE if sender is _UNSET else sender
        self.recipient = [BOB] if recipient is _UNSET else recipient
        self.cc = [] if cc is _UNSET else cc
        self.bcc = [] if bcc is _UNSET else bcc
        self.subject = subject
        self.snippet = snippet
        self.plain = plain
        self.html = html
        self.label_ids = ["INBOX"] if label_ids is _UNSET else label_ids
        self.internalDate = internalDate
        self.headerDate = headerDate
        # Mutation recorders standing in for the fork's Gmail-backed methods.
        self.added_labels = []
        self.removed_labels = []
        self.trash_calls = 0

    def add_label(self, label):
        self.added_labels.append(str(label))

    def remove_label(self, label):
        self.removed_labels.append(str(label))

    def trash(self):
        self.trash_calls += 1


def use_snake_date_attrs(msg, internal_date=None, header_date=None):
    """Replace the camelCase date attributes with the snake_case spellings
    the bridge must also accept (internal_date / header_date)."""
    del msg.internalDate
    del msg.headerDate
    msg.internal_date = internal_date
    msg.header_date = header_date
    return msg


class _Exec:
    def __init__(self, fn):
        self._fn = fn

    def execute(self):
        return self._fn()


class FakeService:
    """Just enough of the raw googleapiclient fluent chain:
    users().messages().list(**kw).execute() and users().threads().get(**kw).execute()."""

    def __init__(self, list_pages=None, thread_gets=None):
        # Pages keyed by the pageToken the caller sent (None for first page).
        self.list_pages = list_pages or {}
        self.thread_gets = thread_gets or {}
        self.list_calls = []
        self.thread_get_calls = []
        self.list_error = None
        self.thread_get_error = None

    def users(self):
        return self

    def messages(self):
        return self

    def threads(self):
        return self

    def list(self, **kwargs):
        self.list_calls.append(kwargs)

        def run():
            if self.list_error is not None:
                raise self.list_error
            return self.list_pages[kwargs.get("pageToken")]

        return _Exec(run)

    def get(self, **kwargs):
        self.thread_get_calls.append(kwargs)

        def run():
            if self.thread_get_error is not None:
                raise self.thread_get_error
            thread_id = kwargs.get("id")
            if thread_id not in self.thread_gets:
                raise FakeHttpError(404, f"thread {thread_id!r} not found")
            return self.thread_gets[thread_id]

        return _Exec(run)


class FakeGmail:
    """Mock of the simplegmail fork's Gmail client (the bridge's only seam)."""

    def __init__(self, labels=None, messages=None, list_pages=None, thread_gets=None):
        self.labels = labels or []
        self.messages_by_id = {m.id: m for m in (messages or [])}
        self.service = FakeService(list_pages=list_pages, thread_gets=thread_gets)
        self.list_labels_calls = 0
        self.list_labels_error = None
        self.get_refs_calls = []
        self.refs_error = None
        self.send_calls = []
        self.sent_message = None

    def list_labels(self):
        self.list_labels_calls += 1
        if self.list_labels_error is not None:
            raise self.list_labels_error
        return list(self.labels)

    def _get_messages_from_refs(self, user_id, message_refs, attachments="reference"):
        self.get_refs_calls.append((user_id, list(message_refs), attachments))
        if self.refs_error is not None:
            raise self.refs_error
        out = []
        for ref in message_refs:
            msg = self.messages_by_id.get(ref["id"])
            if msg is None:
                raise FakeHttpError(404, f"message {ref['id']!r} not found")
            out.append(msg)
        return out

    def send_message(self, **kwargs):
        self.send_calls.append(kwargs)
        if self.sent_message is None:
            self.sent_message = FakeMessage(id="sent-1", thread_id="t-sent")
        return self.sent_message


def inbox_gmail():
    """Standard mailbox: 3 INBOX messages across 2 threads on page one
    (newest-first refs, interleaved threads), 1 more on page two."""
    m1 = FakeMessage(
        id="m1", thread_id="t1", sender=ALICE, subject="Lunch?",
        snippet="latest in t1", internalDate=3000, label_ids=["INBOX", "UNREAD"],
    )
    m2 = FakeMessage(
        id="m2", thread_id="t2", sender=CAROL, recipient=[BOB], subject="Invoice",
        snippet="only in t2", internalDate=2000, label_ids=["INBOX"],
    )
    m3 = FakeMessage(
        id="m3", thread_id="t1", sender=BOB, subject="Lunch?",
        snippet="older in t1", internalDate=1000, label_ids=["INBOX"],
    )
    m4 = FakeMessage(
        id="m4", thread_id="t3", sender=DAVE, subject="Page two",
        snippet="second page", internalDate=4000, label_ids=["INBOX"],
    )
    list_pages = {
        None: {
            "messages": [
                {"id": "m1", "threadId": "t1"},
                {"id": "m2", "threadId": "t2"},
                {"id": "m3", "threadId": "t1"},
            ],
            "nextPageToken": "tok2",
        },
        "tok2": {"messages": [{"id": "m4", "threadId": "t3"}]},
    }
    thread_gets = {
        # Refs newest-first, as Gmail may return them; the bridge must
        # respond oldest-first.
        "t1": {"id": "t1", "messages": [{"id": "m1"}, {"id": "m3"}]},
    }
    return FakeGmail(
        labels=[FakeLabel("INBOX", "INBOX"), FakeLabel("Receipts", "Label_7")],
        messages=[m1, m2, m3, m4],
        list_pages=list_pages,
        thread_gets=thread_gets,
    )
