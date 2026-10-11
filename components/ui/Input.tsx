import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
};

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, disabled, ...props }, ref) => {
    return (
      <div className="space-y-2">
        <input
          ref={ref}
          disabled={disabled}
          className={cn(
            "w-full rounded-xl border-2 border-transparent bg-slate-900/60 px-5 py-4 text-base text-slate-100 placeholder:text-slate-500 transition-all duration-300 focus:border-indigo-600 focus:outline-none focus:ring-0 disabled:cursor-not-allowed",
            error && "border-pink-500",
            className
          )}
          {...props}
        />
        {error && <p className="text-sm text-pink-400">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
