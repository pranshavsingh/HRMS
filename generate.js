const crypto = require('crypto');

const password = 'Hrms@123';

const iterations = 1200000;
const salt = crypto.randomBytes(16).toString('hex');

crypto.pbkdf2(password, salt, iterations, 32, 'sha256', (err, derivedKey) => {
  if (err) throw err;

  const hash = derivedKey.toString('base64');

  console.log(
    `pbkdf2_sha256$${iterations}$${salt}$${hash}`
  );
});