import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import "./App.css";
import { Header, HistoryTransitionPanel, type HistoryTransition } from "@webview/components/shared";
import { ChatView, SettingsView, HistoryView } from "./views";
import { VsCodeProvider } from "./views/chatView/contexts";
import type { Conversation, HandlerToWebviewMessage } from "@/adapters";
import { getVsCodeApi } from "./VsCodeApi";
import { getUiLocale, subscribeUiLocale } from "./i18n";

type ViewType = "chat" | "settings" | "history";

function App() {
  useSyncExternalStore(subscribeUiLocale, getUiLocale, getUiLocale);
  const [currentView, setCurrentView] = useState<ViewType>("chat");
  const [loadedConversation, setLoadedConversation] = useState<Conversation | null>(null);
  const [chatRevision, setChatRevision] = useState(0);
  const [historyEnabled, setHistoryEnabled] = useState<boolean>();
  const [historyUpdatePending, setHistoryUpdatePending] = useState(false);
  const [historyTransition, setHistoryTransition] = useState<HistoryTransition | null>(null);
  const pendingHistoryRequestRef = useRef<string | undefined>(undefined);

  const handleNewConversation = useCallback(() => {
    const vscode = getVsCodeApi();
    if (historyEnabled === false) {
      vscode?.setState({ schemaVersion: 3, mode: "incognito" });
    } else {
      vscode?.setState({
        schemaVersion: 3,
        mode: "persistent",
        draft: "",
        referencedFiles: [],
        messages: [],
      });
    }
    setLoadedConversation(null);
    setCurrentView("chat");
    setChatRevision((revision) => revision + 1);
    vscode?.postMessage({ type: "newConversation" });
  }, [historyEnabled]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<HandlerToWebviewMessage>) => {
      const message = event.data;
      if (message.type === "conversationLoaded") {
        setLoadedConversation(message.conversation);
        setChatRevision((revision) => revision + 1);
        setCurrentView("chat");
      } else if (message.type === "conversationDeleted") {
        const deletedId = message.id;
        setLoadedConversation((current) => (current?.id === deletedId ? null : current));
      } else if (message.type === "clearChat") {
        setLoadedConversation(null);
      } else if (message.type === "configLoaded") {
        if (message.config.historyEnabled !== undefined) {setHistoryEnabled(message.config.historyEnabled);}
      } else if (message.type === "configUpdateResult") {
        if (message.config.historyEnabled !== undefined) {setHistoryEnabled(message.config.historyEnabled);}
        if (message.requestId === pendingHistoryRequestRef.current) {
          pendingHistoryRequestRef.current = undefined;
          setHistoryUpdatePending(false);
          setHistoryTransition(null);
        }
      } else if (message.type === "historyTransitionRequired") {
        const pendingRequestId = pendingHistoryRequestRef.current;
        if (pendingRequestId && pendingRequestId !== message.requestId) {return;}
        pendingHistoryRequestRef.current = message.requestId;
        setHistoryUpdatePending(true);
        setHistoryTransition(message);
      }
    };

    window.addEventListener("message", handleMessage);
    getVsCodeApi()?.postMessage({ type: "getConfig" });
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const handleIncognitoToggle = useCallback((incognito: boolean) => {
    const vscode = getVsCodeApi();
    if (!vscode || historyEnabled === undefined || historyUpdatePending) {return;}
    const requestId = crypto.randomUUID();
    pendingHistoryRequestRef.current = requestId;
    setHistoryUpdatePending(true);
    vscode.postMessage({ type: "saveConfig", requestId, config: { historyEnabled: !incognito } });
  }, [historyEnabled, historyUpdatePending]);

  return (
    <VsCodeProvider>
      <div className="app">
        <Header
          currentView={currentView}
          ViewChangeHandler={setCurrentView}
          onNewConversation={handleNewConversation}
          incognitoEnabled={historyEnabled === false}
          incognitoUpdatePending={historyEnabled === undefined || historyUpdatePending}
          onIncognitoToggle={handleIncognitoToggle}
        />
        <div className={`viewPane ${currentView === "chat" ? "active" : "hidden"}`} aria-hidden={currentView !== "chat"}>
          <ChatView key={chatRevision} loadedConversation={loadedConversation} />
        </div>
        {currentView === "settings" ? (
          <div className="viewPane active">
            <SettingsView />
          </div>
        ) : null}
        {currentView === "history" ? (
          <div className="viewPane active">
            <HistoryView />
          </div>
        ) : null}
        <HistoryTransitionPanel
          transition={historyTransition}
          onDecision={(decision) => {
            if (!historyTransition) {return;}
            getVsCodeApi()?.postMessage({
              type: "resolveHistoryTransition",
              requestId: historyTransition.requestId,
              decision,
            });
          }}
        />
      </div>
    </VsCodeProvider>
  );
}

export default App;
