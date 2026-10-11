"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type EmailFormData = z.infer<typeof emailSchema>;

type Status = "idle" | "success" | "error";

export default function EmailSubscribeForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
  });

  const onSubmit = async (data: EmailFormData) => {
    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Something went wrong");
      }

      setStatus("success");
      reset();
      setTimeout(() => setStatus("idle"), 5000);
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to subscribe"
      );
      setTimeout(() => {
        setStatus("idle");
        setErrorMessage("");
      }, 5000);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto w-full max-w-xl">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <Input
            {...register("email")}
            type="email"
            autoComplete="email"
            placeholder="Enter your email address"
            error={errors.email?.message}
            disabled={isSubmitting}
            className="w-full"
            aria-label="Email address"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isSubmitting}
          className="whitespace-nowrap sm:w-auto"
        >
          {isSubmitting ? "Subscribing..." : "Subscribe"}
        </Button>
      </div>

      {status === "success" && (
        <div
          className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300"
          role="status"
        >
          🎉 You&apos;re in! Check your email to confirm your subscription.
        </div>
      )}

      {status === "error" && (
        <div
          className="mt-4 rounded-xl border border-pink-500/30 bg-pink-500/10 p-4 text-sm text-pink-300"
          role="alert"
        >
          {errorMessage || "Something went wrong. Please try again."}
        </div>
      )}
    </form>
  );
}
