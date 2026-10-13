import { useRouter, type Href } from "expo-router";
import { User } from "lucide-react-native";
import { colors } from "@/theme";
import { EmptyState } from "./States";

export function SignInPrompt({ title, message, next }: { title: string; message: string; next: string }) {
  const router = useRouter();
  return (
    <EmptyState
      icon={<User size={30} color={colors.leaf600} />}
      title={title}
      message={message}
      actionLabel="Sign in"
      onAction={() => router.push({ pathname: "/login", params: { next } } as Href)}
    />
  );
}
