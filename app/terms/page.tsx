import React from "react";

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>

      <div className="prose prose-lg">
        <p className="text-sm text-gray-600 mb-8">
          Last updated: October 10, 2025
        </p>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Acceptance of Terms</h2>
          <p className="mb-4">
            By accessing and using The Gist newsletter service, you accept and
            agree to be bound by the terms and provision of this agreement.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Use License</h2>
          <p className="mb-4">
            Permission is granted to temporarily access the materials
            (information or software) on our website for personal,
            non-commercial transitory viewing only.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Service Description</h2>
          <p className="mb-4">
            The Gist provides curated newsletter content delivered via email. We
            reserve the right to modify or discontinue the service at any time
            without notice.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">User Responsibilities</h2>
          <p className="mb-4">You agree to:</p>
          <ul className="list-disc pl-6 mb-4">
            <li>Provide accurate and current information</li>
            <li>Use the service for lawful purposes only</li>
            <li>Not attempt to gain unauthorized access to our systems</li>
            <li>Respect intellectual property rights</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Privacy</h2>
          <p className="mb-4">
            Your privacy is important to us. Please review our Privacy Policy,
            which also governs your use of the service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">
            Limitation of Liability
          </h2>
          <p className="mb-4">
            In no event shall The Gist or its suppliers be liable for any
            damages (including, without limitation, damages for loss of data or
            profit, or due to business interruption) arising out of the use or
            inability to use the service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Termination</h2>
          <p className="mb-4">
            We may terminate or suspend your account and access to the service
            immediately, without prior notice, for any reason.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Contact Information</h2>
          <p className="mb-4">
            If you have any questions about these Terms of Service, please
            contact us at zknewsletter@gmail.com.
          </p>
        </section>
      </div>
    </div>
  );
}
