import {
  initializeApp,
  cert,
  applicationDefault,
  getApps,
  type App,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// Server-side Firestore access via the Admin SDK, using a service account
// (or Application Default Credentials). This replaces the browser client
// SDK so server writes no longer rely on permissive Firestore rules.
//
// The service account can be provided as:
//   - FIREBASE_SERVICE_ACCOUNT: full JSON string
//   - FIREBASE_SERVICE_ACCOUNT_PATH: path to a JSON key file
//   - GOOGLE_APPLICATION_CREDENTIALS / GCE metadata (applicationDefault)

const getCredential = () => {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccount) {
    try {
      return cert(JSON.parse(serviceAccount));
    } catch {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT must be a valid service account JSON string"
      );
    }
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (serviceAccountPath) {
    return cert(serviceAccountPath);
  }

  return applicationDefault();
};

const projectId =
  process.env.FIREBASE_PROJECT_ID ??
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) {
    return existing;
  }
  return initializeApp({ credential: getCredential(), projectId });
}

const app = getAdminApp();
const db: Firestore = getFirestore(app);

export { app, db };