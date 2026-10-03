import { Pressable, Text, View } from 'react-native';
import { AUTH_MODE } from '../api/config';
import { getSupabase } from '../auth/supabase';
import { focusCapture } from '../ui/captureBus';
import { tokens } from '../ui/tokens';

export function TopBar({ right }: { right?: React.ReactNode }) {
  return (
    // zIndex: react-native-web gives every View its own stacking context (z-index 0), which would
    // otherwise trap the "+ View" dropdown underneath the workspace panels rendered after it.
    <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8, borderBottomWidth: 1, borderBottomColor: tokens.color.border, backgroundColor: tokens.color.bg, zIndex: 30 }}>
      <Text style={{ flex: 1, fontWeight: '600', fontSize: tokens.font.size.md }}>◫ Personal Sprint</Text>
      <Pressable testID="add-item" onPress={focusCapture} style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: tokens.radius.sm }}>
        <Text style={{ color: tokens.color.muted }}>+ Item</Text>
      </Pressable>
      {right}
      {AUTH_MODE === 'supabase' && (
        <Pressable onPress={() => getSupabase().auth.signOut()} style={{ paddingVertical: 4, paddingHorizontal: 8 }}>
          <Text style={{ color: tokens.color.muted }}>Sign out</Text>
        </Pressable>
      )}
    </View>
  );
}
