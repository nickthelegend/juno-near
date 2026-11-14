import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import styled from "styled-components/native";

import { BottomSheet } from "./BottomSheet";
import { Button } from "./kit";
import { JunoIcon } from "./logo";
import { NETWORK_NAME } from "../lib/chain";
import { theme } from "../theme";

/** What the Juno wallet asks its owner to approve: a transaction, or a signature. */
export type ApprovalRequest = {
  kind: "tx" | "sign";
  /** What the app is doing, e.g. "Place sealed bid". */
  title: string;
  /** Label/value rows: amount, contract, fee, message. */
  rows: { label: string; value: string }[];
  /** The signing NEAR account. */
  account: string;
};

/**
 * The test wallet's approval sheet (QA signer builds only: the film's phone build, never a production bundle).
 * A NEAR browser wallet opens its own window for every transaction; the QA signer would otherwise sign silently.
 * Here each transaction shows what it does, the contract and method it calls, the NEAR it attaches and its gas,
 * and nothing is signed until Approve is tapped. Reject cancels the step with no transaction sent.
 */
export function ApproveSheet({ request: live, onAnswer }: { request: ApprovalRequest | null; onAnswer: (approved: boolean) => void }) {
  // The last request stays rendered while the sheet slides away: emptying it mid-close changed the sheet's height,
  // which interrupted the closing animation and left the backdrop on screen.
  const [request, setShown] = useState<ApprovalRequest | null>(live);
  useEffect(() => {
    if (live) setShown(live);
  }, [live]);
  return (
    <BottomSheet visible={!!live} onClose={() => onAnswer(false)}>
      {request ? (
        <Body_>
          <Head>
            <Badge>
              <JunoIcon size={20} />
            </Badge>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.muted }}>Test wallet · {short(request.account)}</Text>
              <Text style={{ fontSize: 12, color: theme.colors.faint }}>{request.kind === "tx" ? `Transaction on ${NETWORK_NAME}` : "Signature, no transaction, no gas"}</Text>
            </View>
          </Head>
          <Text style={{ fontSize: 26, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.5 }}>{request.title}</Text>
          <Rows>
            {request.rows.map((row, i) => (
              <RowLine key={row.label} $first={i === 0}>
                <Text style={{ fontSize: 14, color: theme.colors.muted }}>{row.label}</Text>
                <Text style={{ fontSize: 14, fontWeight: "700", color: theme.colors.text, flexShrink: 1, textAlign: "right" }} numberOfLines={3}>
                  {row.value}
                </Text>
              </RowLine>
            ))}
          </Rows>
          <Buttons>
            <View style={{ flex: 1 }}>
              <Button label="Reject" variant="quiet" tall onPress={() => onAnswer(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Approve" tall onPress={() => onAnswer(true)} />
            </View>
          </Buttons>
        </Body_>
      ) : null}
    </BottomSheet>
  );
}

const short = (a: string) => (a.length > 28 ? `${a.slice(0, 14)}…${a.slice(-10)}` : a);

const Body_ = styled.View`
  padding: 6px 20px 28px;
  gap: 14px;
`;
const Head = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 12px;
`;
const Badge = styled.View`
  width: 40px;
  height: 40px;
  border-radius: 20px;
  align-items: center;
  justify-content: center;
  background-color: ${theme.colors.ink};
`;
const Rows = styled.View`
  border-radius: 16px;
  background-color: ${theme.colors.surfaceAlt};
  padding: 4px 14px;
`;
const RowLine = styled.View<{ $first?: boolean }>`
  flex-direction: row;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 0;
  border-top-width: ${(p) => (p.$first ? 0 : 1)}px;
  border-top-color: ${theme.colors.line};
`;
const Buttons = styled.View`
  flex-direction: row;
  gap: 10px;
  margin-top: 4px;
`;
