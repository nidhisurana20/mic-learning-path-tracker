# app.py
import os
from dotenv import load_dotenv

load_dotenv()

from flask import Flask, jsonify
from routes.api import api

app = Flask(__name__)


@app.route("/")
def health_check():
    return jsonify({"status": "ok", "message": "MIC Learning Path Tracker API is running."})


app.register_blueprint(api, url_prefix="/api")


# Basic 404 + error handlers so nothing crashes/blank-screens
@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def server_error(e):
    app.logger.error(e)
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    app.run(host="0.0.0.0", port=port)
