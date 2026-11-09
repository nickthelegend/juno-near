import { useEffect, useState } from "react";
import { TextInput } from "react-native";
import styled from "styled-components/native";

import { BottomSheet } from "./BottomSheet";
import { Body, Button, Caption, Title } from "./kit";
import type { SignInBridge } from "../lib/wallet";
import { theme } from "../theme";

/**
 * Sign in with email; the relayer makes a NEAR testnet account.
 *
 * Two steps in one sheet: an email address, then the six-digit code the Juno
 * relayer sends to it. On verify this device generates the account's key and
 * keeps it; the relayer only ever sees the public half. The wallet provider
 * closes the sheet once the account exists, so this component never has to
 * know what the caller was trying to do.
 *
 * When the relayer is not configured the sheet says exactly what is missing
 * rather than pretending a code was sent.
 */
export function SignInSheet({
  visible,
  onClose,
  bridge,
}: {
  visible: boolean;
  onClose: () => void;
  bridge: SignInBridge;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start clean each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setCode("");
    setStep("email");
    setError(null);
    setBusy(false);
  }, [visible]);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await bridge.sendCode(email.trim());
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the code");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await bridge.loginWithCode(code.trim(), email.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code did not work");
      setBusy(false);
    }
  };

  const validEmail = /.+@.+\..+/.test(email.trim());

  return (
    <BottomSheet visible={visible} onClose={onClose} dismissable={!busy}>
      <Sheet>
        <Title>Sign in to Juno</Title>
        <Body muted>
          {step === "email"
            ? "Juno makes you a NEAR account. No seed phrase, nothing to install, and the key stays on this device."
            : `Enter the six-digit code sent to ${email.trim()}.`}
        </Body>

        {step === "email" ? (
          <>
            <Field>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={theme.colors.faint}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="send"
                onSubmitEditing={() => validEmail && !bridge.setup && void sendCode()}
                style={{ fontSize: theme.type.body.size, color: theme.colors.text }}
              />
            </Field>
            <Button label="Send code" onPress={() => void sendCode()} loading={busy} disabled={!validEmail || !!bridge.setup} tall />
          </>
        ) : (
          <>
            <Field>
              <TextInput
                value={code}
                onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                placeholderTextColor={theme.colors.faint}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                style={{
                  fontSize: theme.type.title.size,
                  letterSpacing: 6,
                  color: theme.colors.text,
                }}
              />
            </Field>
            <Button label="Verify" onPress={() => void verify()} loading={busy} disabled={code.length !== 6} tall />
            <Caption onPress={() => setStep("email")}>Use a different email</Caption>
          </>
        )}

        {error ? <ErrorText>{error}</ErrorText> : bridge.setup ? <ErrorText>{bridge.setup}</ErrorText> : null}
        <Secured>NEAR testnet · gas paid by the Juno relayer</Secured>
      </Sheet>
    </BottomSheet>
  );
}

const Sheet = styled.View`
  gap: ${(p) => p.theme.space(3)}px;
  padding: ${(p) => p.theme.space(2)}px ${(p) => p.theme.space(5)}px ${(p) => p.theme.space(8)}px;
`;

const Field = styled.View`
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  padding-vertical: 14px;
  border-radius: ${(p) => p.theme.radius.md}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
  border-width: ${(p) => p.theme.hairline}px;
  border-color: ${(p) => p.theme.colors.lineStrong};
`;

const ErrorText = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  color: ${(p) => p.theme.colors.neg};
`;

const Secured = styled.Text`
  text-align: center;
  font-size: ${(p) => p.theme.type.caption.size}px;
  color: ${(p) => p.theme.colors.faint};
`;
