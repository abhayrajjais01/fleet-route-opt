"""
test_passwords.py - Change, forgot and reset password

Verifies that temporary passwords must be replaced before anything else, that changing or resetting a password ends
older sessions, that only admins can reset, and that forgot-password never reveals whether an account exists.
"""

from app.models.audit import AuditLog
from tests.conftest import TestingSessionLocal, auth_headers

API = "/api/v1"


def _login(client, email, password):
    return client.post(f"{API}/auth/login", json={"email": email, "password": password})


def _bearer(res):
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def _change(client, headers, current, new):
    return client.post(f"{API}/auth/change-password", headers=headers, json={"current_password": current, "new_password": new})


def test_change_password_ends_other_sessions(client):
    h = auth_headers(client, "change@pw.io", "DISPATCHER")
    other = _bearer(_login(client, "change@pw.io", "Password123!"))
    res = _change(client, h, "Password123!", "Better-Pass-42")
    assert res.status_code == 200
    fresh = _bearer(res)
    assert client.get(f"{API}/auth/me", headers=fresh).status_code == 200
    assert client.get(f"{API}/auth/me", headers=h).status_code == 401              # the old token
    assert client.get(f"{API}/shipments", headers=other).status_code == 401        # and the other device
    assert _login(client, "change@pw.io", "Password123!").status_code == 401
    assert _login(client, "change@pw.io", "Better-Pass-42").status_code == 200


def test_change_password_rules(client):
    h = auth_headers(client, "rules@pw.io", "DISPATCHER")
    wrong = _change(client, h, "not-it", "Better-Pass-42")
    assert wrong.status_code == 400 and "current password" in wrong.json()["detail"]
    assert _change(client, h, "Password123!", "Password123!").status_code == 400
    assert _change(client, h, "Password123!", "rules@pw.io").status_code == 400
    assert _change(client, h, "Password123!", "short").status_code == 422
    assert client.post(f"{API}/auth/change-password", json={"current_password": "a", "new_password": "Better-Pass-42"}).status_code == 401
    assert client.get(f"{API}/auth/me", headers=h).status_code == 200              # nothing changed


def test_admin_created_account_must_change_its_temporary_password(client):
    admin = auth_headers(client, "boss@pw.io", "ADMIN")
    made = client.post(f"{API}/users", headers=admin, json={"email": "new@pw.io", "full_name": "New Person", "role": "DISPATCHER",
                                                            "password": "Temporary-1"})
    assert made.status_code == 201
    login = _login(client, "new@pw.io", "Temporary-1")
    assert login.json()["user"]["must_change_password"] is True
    h = _bearer(login)
    assert client.get(f"{API}/auth/me", headers=h).status_code == 200
    blocked = client.get(f"{API}/shipments", headers=h)
    assert blocked.status_code == 403 and "temporary password" in blocked.json()["detail"]
    assert client.post(f"{API}/auth/refresh", headers=h).status_code == 403
    fresh = _bearer(_change(client, h, "Temporary-1", "My-Own-Pass-1"))
    assert client.get(f"{API}/shipments", headers=fresh).status_code == 200


def test_forgot_password_and_admin_reset(client):
    admin = auth_headers(client, "boss2@pw.io", "ADMIN")
    user = auth_headers(client, "forgot@pw.io", "DISPATCHER")
    real = client.post(f"{API}/auth/forgot-password", json={"email": "forgot@pw.io"})
    ghost = client.post(f"{API}/auth/forgot-password", json={"email": "nobody@pw.io"})
    assert real.status_code == ghost.status_code == 202 and real.json() == ghost.json()
    assert _login(client, "forgot@pw.io", "Password123!").status_code == 200       # asking alone changes nothing

    listed = next(u for u in client.get(f"{API}/users", headers=admin).json() if u["email"] == "forgot@pw.io")
    assert listed["reset_requested"] is True
    url = f"{API}/users/{listed['id']}/reset-password"
    assert client.post(url, headers=user).status_code == 403
    temp = client.post(url, headers=admin).json()["temporary_password"]
    assert len(temp) >= 10
    assert client.get(f"{API}/auth/me", headers=user).status_code == 401           # existing session ended
    assert _login(client, "forgot@pw.io", "Password123!").status_code == 401
    login = _login(client, "forgot@pw.io", temp)
    assert login.status_code == 200 and login.json()["user"]["must_change_password"] is True
    listed = next(u for u in client.get(f"{API}/users", headers=admin).json() if u["email"] == "forgot@pw.io")
    assert listed["reset_requested"] is False

    me = client.get(f"{API}/auth/me", headers=admin).json()["id"]
    assert client.post(f"{API}/users/{me}/reset-password", headers=admin).status_code == 409


def test_passwords_never_reach_the_audit_log(client):
    admin = auth_headers(client, "boss3@pw.io", "ADMIN")
    auth_headers(client, "quiet@pw.io", "DISPATCHER")
    uid = next(u["id"] for u in client.get(f"{API}/users", headers=admin).json() if u["email"] == "quiet@pw.io")
    temp = client.post(f"{API}/users/{uid}/reset-password", headers=admin).json()["temporary_password"]
    _change(client, _bearer(_login(client, "quiet@pw.io", temp)), temp, "Hidden-Pass-77")
    db = TestingSessionLocal()
    try:
        text = " ".join(f"{e.details} {e.before_state} {e.after_state}" for e in db.query(AuditLog).all())
    finally:
        db.close()
    assert "Reset the password of quiet@pw.io" in text
    assert temp not in text and "Hidden-Pass-77" not in text
