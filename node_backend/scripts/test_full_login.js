async function run() {
  try {
    const res = await fetch("http://localhost:8000/api/auth/login/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "hr1",
        password: "password123"
      })
    });
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Response Body:", data);
  } catch (err) {
    console.error("API Call Failed:", err);
  }
  process.exit(0);
}

run();
