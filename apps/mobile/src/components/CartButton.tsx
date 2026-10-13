import { useRouter } from "expo-router";
import { ShoppingBasket } from "lucide-react-native";
import { useCart } from "@/lib/cart";
import { colors } from "@/theme";
import { IconButton } from "./IconButton";

export function CartButton({ variant = "plain" }: { variant?: "plain" | "soft" }) {
  const router = useRouter();
  const { count } = useCart();
  return (
    <IconButton label="Basket" badge={count} variant={variant} onPress={() => router.push("/cart")}>
      <ShoppingBasket size={23} color={colors.forest900} strokeWidth={1.8} />
    </IconButton>
  );
}
