import { PRIORITY_ROLE } from "../../api/types";
import { t } from "../../i18n";
import { ConnectionStatus, LanguageControl, TopBar } from "../../shell/parts";
import { Icon, ListRow, Switch } from "../../ui";
import { useCitizen } from "../session";

/** `/app/settings`: one-off settings that used to crowd the main screen. */
export function SettingsScreen() {
  const { priority, setRole, connected } = useCitizen();
  return (
    <div className="screen">
      <TopBar title={t("tabs.settings")} trailing={<ConnectionStatus connected={connected} />} />
      <div className="screen__body">
        <section className="settings-group">
          <h2>{t("settings.role")}</h2>
          <Switch
            checked={priority}
            onChange={(on) => setRole(on ? PRIORITY_ROLE : "standard")}
            label={t("citizen.role.title")}
            description={t("citizen.role.desc")}
            icon="accessible"
            tone="priority"
          />
        </section>

        <section className="settings-group">
          <h2>{t("app.language")}</h2>
          <LanguageControl />
        </section>

        <section className="settings-group">
          <h2>{t("settings.privacy")}</h2>
          <p className="privacy">
            <Icon name="lock" />
            <span>{t("settings.privacyText")}</span>
          </p>
        </section>

        <section className="settings-group">
          <h2>{t("settings.dispatcher")}</h2>
          <div className="settings-link">
            <ListRow to="/operator" icon="shield" title={t("settings.dispatcherLink")} subtitle={t("settings.dispatcherText")} />
          </div>
        </section>
      </div>
    </div>
  );
}
