import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  setDoc,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Subscriber {
  email: string;
  subscribedAt: Date;
  isActive: boolean;
}

export interface EmailSendStatus {
  id: string;
  startedAt: Date | Timestamp;
  completedAt?: Date | Timestamp;
  status: "pending" | "success" | "failed";
  totalRecipients: number;
  successfulRecipients: number;
  failedRecipients: number;
  nodeMailerResponse?: any;
  error?: string;
  articlesSummary: {
    totalArticles: number;
    totalTopics: number;
    totalPublishers: number;
  };
}

// Add a new subscriber to the database
export async function addSubscriber(email: string): Promise<boolean> {
  try {
    // Check if email already exists
    const subscribersRef = collection(db, "subscribers");
    const q = query(subscribersRef, where("email", "==", email));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      // Email already exists
      return false;
    }

    // Add new subscriber
    await addDoc(subscribersRef, {
      email: email.toLowerCase().trim(),
      subscribedAt: new Date(),
      isActive: true,
    });

    return true;
  } catch (error) {
    console.error("Error adding subscriber:", error);
    throw new Error("Failed to add subscriber");
  }
}

// Get all active subscribers
export async function getActiveSubscribers(): Promise<string[]> {
  try {
    const subscribersRef = collection(db, "subscribers");
    const q = query(subscribersRef, where("isActive", "==", true));
    const querySnapshot = await getDocs(q);

    const emails: string[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      emails.push(data.email);
    });

    return emails;
  } catch (error) {
    console.error("Error getting subscribers:", error);
    throw new Error("Failed to get subscribers");
  }
}

// Create a new email send status record
export async function createEmailSendStatus(
  id: string,
  totalRecipients: number,
  articlesSummary: EmailSendStatus["articlesSummary"]
): Promise<void> {
  try {
    const statusRef = doc(db, "emailSends", id);
    const status: EmailSendStatus = {
      id,
      startedAt: new Date(),
      status: "pending",
      totalRecipients,
      successfulRecipients: 0,
      failedRecipients: 0,
      articlesSummary,
    };

    await setDoc(statusRef, status);
  } catch (error) {
    console.error("Error creating email send status:", error);
    throw new Error("Failed to create email send status");
  }
}

// Helper function to remove undefined values from an object
function removeUndefinedFields(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedFields);
  }

  if (typeof obj === "object") {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefinedFields(value);
      }
    }
    return cleaned;
  }

  return obj;
}

// Update email send status with completion details
export async function updateEmailSendStatus(
  id: string,
  status: "success" | "failed",
  nodeMailerResponse?: any,
  error?: string,
  successfulRecipients?: number,
  failedRecipients?: number
): Promise<void> {
  try {
    const statusRef = doc(db, "emailSends", id);
    const updateData: Partial<EmailSendStatus> = {
      completedAt: new Date(),
      status,
    };

    // Only add nodeMailerResponse if it exists and remove undefined fields
    if (nodeMailerResponse) {
      updateData.nodeMailerResponse = removeUndefinedFields(nodeMailerResponse);
    }

    // Only add error if it exists
    if (error) {
      updateData.error = error;
    }

    if (successfulRecipients !== undefined) {
      updateData.successfulRecipients = successfulRecipients;
    }
    if (failedRecipients !== undefined) {
      updateData.failedRecipients = failedRecipients;
    }

    await setDoc(statusRef, updateData, { merge: true });
  } catch (error) {
    console.error("Error updating email send status:", error);
    throw new Error("Failed to update email send status");
  }
}

// Helper function to convert Firestore timestamp to Date
function toDate(timestamp: Date | Timestamp): Date {
  if (timestamp instanceof Date) {
    return timestamp;
  }
  return timestamp.toDate();
}

// Get email send status by ID
export async function getEmailSendStatus(
  id: string
): Promise<EmailSendStatus | null> {
  try {
    const statusRef = doc(db, "emailSends", id);
    const docSnap = await getDocs(
      query(collection(db, "emailSends"), where("id", "==", id))
    );

    if (docSnap.empty) {
      return null;
    }

    const data = docSnap.docs[0].data() as EmailSendStatus;
    return {
      ...data,
      startedAt: toDate(data.startedAt),
      completedAt: data.completedAt ? toDate(data.completedAt) : undefined,
    };
  } catch (error) {
    console.error("Error getting email send status:", error);
    throw new Error("Failed to get email send status");
  }
}

// Get recent email send statuses
export async function getRecentEmailSends(
  limitNum: number = 20
): Promise<EmailSendStatus[]> {
  try {
    const statusRef = collection(db, "emailSends");
    const q = query(statusRef, orderBy("startedAt", "desc"), limit(limitNum));
    const querySnapshot = await getDocs(q);

    const statuses: EmailSendStatus[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as EmailSendStatus;
      statuses.push({
        ...data,
        startedAt: toDate(data.startedAt),
        completedAt: data.completedAt ? toDate(data.completedAt) : undefined,
      });
    });

    return statuses;
  } catch (error) {
    console.error("Error getting recent email sends:", error);
    throw new Error("Failed to get recent email sends");
  }
}
