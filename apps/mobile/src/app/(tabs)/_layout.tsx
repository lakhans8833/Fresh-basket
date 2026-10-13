import { Tabs } from "expo-router";
import { House, LayoutGrid, ReceiptText, User } from "lucide-react-native";
import { Platform } from "react-native";
import { colors, fonts } from "@/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.forest900,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 15, minHeight: 15 },
        tabBarItemStyle: Platform.OS === "web" ? { height: 52 } : undefined,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.line,
          // Web has no bottom safe-area inset; give icon + label room.
          ...(Platform.OS === "web" ? { height: 62, paddingTop: 6, paddingBottom: 6 } : {}),
        },
        sceneStyle: { backgroundColor: colors.ivory },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: ({ color, focused }) => <House size={23} color={color} strokeWidth={focused ? 2.2 : 1.7} /> }}
      />
      <Tabs.Screen
        name="categories"
        options={{ title: "Categories", tabBarIcon: ({ color, focused }) => <LayoutGrid size={23} color={color} strokeWidth={focused ? 2.2 : 1.7} /> }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: "Orders", tabBarIcon: ({ color, focused }) => <ReceiptText size={23} color={color} strokeWidth={focused ? 2.2 : 1.7} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: ({ color, focused }) => <User size={23} color={color} strokeWidth={focused ? 2.2 : 1.7} /> }}
      />
    </Tabs>
  );
}
