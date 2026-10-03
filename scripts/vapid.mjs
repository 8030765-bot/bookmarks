// One-time setup for browser push notifications: prints a key pair.
// Put both lines in Vercel -> Project -> Settings -> Environment Variables.
import webpush from "web-push";
const keys = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("\nOptional: VAPID_SUBJECT=mailto:you@example.com (a contact address push services can use)");
