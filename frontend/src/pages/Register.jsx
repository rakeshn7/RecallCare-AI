
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../services/api";

function Register() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (loading) return;

    setLoading(true);

    try {
      await API.post("/register", {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
      });

      alert("Registration successful! Please log in.");
      navigate("/login", { replace: true });

    } catch (err) {
      const detail = err.response?.data?.detail;

      let errorMessage = "Registration failed. Please try again.";

      if (Array.isArray(detail)) {
        errorMessage = detail
          .map((item) => {
            const field = Array.isArray(item.loc)
              ? item.loc.slice(1).join(".")
              : "Input";

            return `${field}: ${item.msg}`;
          })
          .join("\n");

      } else if (typeof detail === "string") {
        errorMessage = detail;

      } else if (typeof detail === "object" && detail !== null) {
        errorMessage = JSON.stringify(detail);
      }

      setError(errorMessage);

    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Create Account</h1>

        <p>Join RecallCare AI</p>

        {error && (
          <p
            className="error"
            style={{ whiteSpace: "pre-line" }}
          >
            {error}
          </p>
        )}

        <input
          name="full_name"
          type="text"
          placeholder="Full Name"
          value={form.full_name}
          onChange={handleChange}
          required
          minLength={2}
          maxLength={100}
        />

        <input
          name="email"
          type="email"
          placeholder="Email Address"
          value={form.email}
          onChange={handleChange}
          required
        />

        <input
          name="password"
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={handleChange}
          required
          minLength={6}
        />

        <button
          type="submit"
          disabled={loading}
        >
          {loading ? "Creating Account..." : "Create Account"}
        </button>

        <p>
          Already have an account?{" "}
          <Link to="/login">Login</Link>
        </p>
      </form>
    </div>
  );
}

export default Register;
