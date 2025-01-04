import bcrypt from 'bcrypt';

const password = process.argv[2] || 'password123';
const saltRounds = 10;

bcrypt.hash(password, saltRounds).then(hash => {
    console.log('Password:', password);
    console.log('Hash:', hash);
}).catch(err => {
    console.error('Error generating hash:', err);
});