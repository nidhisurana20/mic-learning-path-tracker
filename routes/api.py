# routes/api.py
from flask import Blueprint, jsonify, request

from data.cert_data import DOMAINS, CERTS
from services import progress_service
from services.ai_service import explain_next_cert

api = Blueprint("api", __name__)


def _domain_exists(domain_id):
    return any(d["id"] == domain_id for d in DOMAINS)


# GET /api/domains — list all domains
@api.route("/domains", methods=["GET"])
def list_domains():
    return jsonify({"domains": DOMAINS})


# GET /api/domains/<domain_id>/certs — all certs in a domain (raw, no user state)
@api.route("/domains/<domain_id>/certs", methods=["GET"])
def list_certs(domain_id):
    if not _domain_exists(domain_id):
        return jsonify({"error": f"Unknown domain '{domain_id}'"}), 404
    return jsonify({"certs": progress_service.certs_for_domain(domain_id)})


# GET /api/users/<user_id>/domains/<domain_id>/progress
# -> completed/available/locked for every cert in the domain, for this user
@api.route("/users/<user_id>/domains/<domain_id>/progress", methods=["GET"])
def get_progress(user_id, domain_id):
    if not _domain_exists(domain_id):
        return jsonify({"error": f"Unknown domain '{domain_id}'"}), 404
    progress = progress_service.get_domain_progress(user_id, domain_id)
    return jsonify({"userId": user_id, "domainId": domain_id, "progress": progress})


# POST /api/users/<user_id>/certs/<cert_id>/complete
# -> marks a cert complete (only if it's currently "available"), recomputes
#    the path, and returns it.
@api.route("/users/<user_id>/certs/<cert_id>/complete", methods=["POST"])
def complete_cert(user_id, cert_id):
    cert = next((c for c in CERTS if c["id"] == cert_id), None)
    if cert is None:
        return jsonify({"error": f"Unknown cert '{cert_id}'"}), 404

    result = progress_service.mark_cert_complete(user_id, cert_id)
    if not result["ok"]:
        return jsonify({"error": result["error"]}), 409

    return jsonify({"userId": user_id, "domainId": cert["domain"], "progress": result["progress"]})


# POST /api/users/<user_id>/domains/<domain_id>/explain
# body: { "goal": "..." } (optional)
# -> figures out the next available cert (app logic), then asks the AI to
#    explain WHY it's next. AI never picks the cert, only explains it.
@api.route("/users/<user_id>/domains/<domain_id>/explain", methods=["POST"])
def explain(user_id, domain_id):
    if not _domain_exists(domain_id):
        return jsonify({"error": f"Unknown domain '{domain_id}'"}), 404

    body = request.get_json(silent=True) or {}
    goal = body.get("goal")

    next_cert = progress_service.get_next_available_cert(user_id, domain_id)
    if next_cert is None:
        return jsonify(
            {
                "cert_id": None,
                "explanation": "No available cert right now — either everything is completed, or nothing has been unlocked yet.",
            }
        )

    completed_names = [
        c["name"]
        for c in progress_service.get_domain_progress(user_id, domain_id)
        if c["status"] == "completed"
    ]

    cert = next(c for c in CERTS if c["id"] == next_cert["id"])
    result = explain_next_cert(cert, completed_names, goal)

    return jsonify({"cert_id": next_cert["id"], "explanation": result["explanation"], "source": result["source"]})
