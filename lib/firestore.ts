import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Subscriber {
  email: string;
  subscribedAt: Date;
  isActive: boolean;
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
