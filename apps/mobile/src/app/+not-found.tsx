import { useRouter } from "expo-router";
import { View } from "react-native";
import { ScreenHeader } from "@/components/ScreenHeader";
import { EmptyState } from "@/components/States";

export default function NotFound() {
  const router = useRouter();
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Not found" />
      <EmptyState title="Page not found" message="This page doesn't exist." actionLabel="Go home" onAction={() => router.replace("/")} />
    </View>
  );
}
