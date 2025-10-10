import React from "react";

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>

      <div className="prose prose-lg">
        <p className="text-sm text-gray-600 mb-8">
          Last updated: October 10, 2025
        </p>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">
            Information We Collect
          </h2>
          <p className="mb-4">
            We collect information you provide directly to us, such as when you
            subscribe to our newsletter, create an account, or contact us for
            support. This may include your email address, name, and any other
            information you choose to provide.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">
            How We Use Your Information
          </h2>
          <p className="mb-4">We use the information we collect to:</p>
          <ul className="list-disc pl-6 mb-4">
            <li>Send you newsletters and updates</li>
            <li>Respond to your inquiries and provide customer support</li>
            <li>Improve our services and develop new features</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Information Sharing</h2>
          <p className="mb-4">
            We do not sell, trade, or otherwise transfer your personal
            information to third parties without your consent, except as
            described in this policy or as required by law.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Data Security</h2>
          <p className="mb-4">
            We implement appropriate security measures to protect your personal
            information against unauthorized access, alteration, disclosure, or
            destruction.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Your Rights</h2>
          <p className="mb-4">
            You have the right to access, update, or delete your personal
            information. You may also unsubscribe from our newsletter at any
            time.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Contact Us</h2>
          <p className="mb-4">
            If you have any questions about this Privacy Policy, please contact
            us at zknewsletter@gmail.com.
          </p>
        </section>
      </div>
    </div>
  );
}
