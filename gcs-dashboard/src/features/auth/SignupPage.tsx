import { SignupFormView } from "./SignupFormView";
import { useSignupForm } from "./useSignupForm";
import "./LoginPage.css";

export function SignupPage() {
  return <SignupFormView form={useSignupForm()} />;
}
