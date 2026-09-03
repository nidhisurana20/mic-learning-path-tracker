# services/progress_service.py
#
# This is the "your code decides, not the AI" logic. Everything here is a
# pure function over the cert dataset + a set of completed cert ids.

from data.cert_data import CERTS

# In-memory store: user_id -> set of completed cert ids.
# (Swappable for a JSON file or real DB later without touching the logic
# below — that's the point of keeping it behind get_completed_set/mark_complete.)
_user_completed_certs = {}


def get_completed_set(user_id):
    if user_id not in _user_completed_certs:
        _user_completed_certs[user_id] = set()
    return _user_completed_certs[user_id]


def certs_for_domain(domain_id):
    return [c for c in CERTS if c["domain"] == domain_id]


def compute_status(cert, completed_set):
    """
    A cert is:
      - completed  -> already in the user's completed set
      - available  -> not completed, and every prerequisite IS completed
      - locked     -> not completed, and at least one prerequisite is NOT completed
    """
    if cert["id"] in completed_set:
        return "completed"
    prereqs_met = all(p in completed_set for p in cert["prerequisites"])
    return "available" if prereqs_met else "locked"


def get_domain_progress(user_id, domain_id):
    """
    Returns the full path for a domain with each cert annotated with its
    status, in prerequisite order (certs with fewer prerequisites first —
    good enough ordering for this dataset's simple DAG).
    """
    completed_set = get_completed_set(user_id)
    certs = certs_for_domain(domain_id)

    ordered = sorted(certs, key=lambda c: len(c["prerequisites"]))

    return [
        {
            "id": cert["id"],
            "name": cert["name"],
            "level": cert["level"],
            "url": cert["url"],
            "prerequisites": cert["prerequisites"],
            "status": compute_status(cert, completed_set),
        }
        for cert in ordered
    ]


def mark_cert_complete(user_id, cert_id):
    """
    Marks a cert complete for a user IF it is currently "available".
    Returns { ok, error?, progress } — progress is the recomputed path.
    """
    cert = next((c for c in CERTS if c["id"] == cert_id), None)
    if cert is None:
        return {"ok": False, "error": "Unknown cert id"}

    completed_set = get_completed_set(user_id)
    status = compute_status(cert, completed_set)

    if status == "completed":
        return {"ok": False, "error": "Cert already completed"}
    if status == "locked":
        return {"ok": False, "error": "Prerequisites not met — cert is locked"}

    completed_set.add(cert_id)
    return {"ok": True, "progress": get_domain_progress(user_id, cert["domain"])}


def get_next_available_cert(user_id, domain_id):
    """
    The "current step" for AI-explanation purposes: the first available
    (not completed, prerequisites met) cert in the domain, in path order.
    This is what the AI will be asked to explain — it does NOT choose it.
    """
    progress = get_domain_progress(user_id, domain_id)
    return next((c for c in progress if c["status"] == "available"), None)
