# Evakuasiya: vətəndaş mobil tətbiqi

Vətəndaş tətbiqinin React Native (Expo SDK 58) versiyası. Veb tətbiqlə eyni backend-ə, eyni dizayn tokenlərinə və eyni sessiya məntiqinə əsaslanır. Dispetçer paneli mobil tətbiqin içindədir (Ayarlar → «Dispetçer girişi»): giriş, canlı xəritə, həyəcanlar (təsdiq və rədd), SOS növbəsi və resurslar native ekranlardır; simulyasiya və audit jurnalı yalnız vebdədir.

## İşə salma

Backend işləməlidir (`make dev` və ya `cd backend && .venv/bin/uvicorn app.main:app --port 8000`).

```bash
cd mobile
npm install
npx expo start --ios      # iOS simulyatorunda Expo Go ilə açır
```

- Simulyatorda `localhost` backend-in işlədiyi Mac-dir, əlavə ayar lazım deyil.
- Real telefonda: `EXPO_PUBLIC_API_URL=http://<Mac-in LAN ünvanı>:8000 npx expo start`, backend isə `--host 0.0.0.0` ilə işə salınmalıdır.
- Simulyatorun mövqeyini Bakıya qoymaq üçün: `xcrun simctl location booted set 40.383,49.81`. Demo ərazisindən kənar mövqe rədd edilir; bu halda rayon seçin və ya xəritəyə toxunun.

Yoxlama: `npx tsc --noEmit`.

## Vəziyyət

- Tip yoxlaması təmizdir, Metro iOS paketini yığır, tətbiq iOS simulyatorunda (iPhone 18 Pro, iOS 27.2) Expo Go ilə açılıb.
- Simulyatorda sınaqdan sonra düzəldilənlər: xəritə vərəqindəki düymələr alt-alta düzülür (yan-yana olanda uzun yazılar hərf-hərf bölünürdü); ekran başlıqları məzmunla eyni yan boşluqdadır.
- Android-də və real cihazda sınanmayıb. Avtomatik test yoxdur.

## Ekranlar

| Marşrut | Ekran |
|---|---|
| `/` | İlk dəfə `/welcome`, sonra `/map` |
| `/welcome` | Dil → mövqe (cihaz və ya rayon) → xüsusi qayğı rolu |
| `/map` | Tam ekran xəritə, cari marşrut aşağıdakı vərəqdə |
| `/points`, `/points/[id]` | Toplanış nöqtələri və təfərrüat, «Bura get» |
| `/sos` | Dörd təhlükə düyməsi, 5 saniyəlik geri alma, status, «Təhlükəsizəm» |
| `/settings` | Rol, dil, məxfilik qeydi, dispetçer girişinə keçid |
| `/operator/login` | Dispetçer girişi (JWT, rollar) |
| `/operator/live` | Canlı xəritə: SOS, Prioritet №1, nöqtələr, briqadalar, bağlı yollar; toxunuşla təfərrüat |
| `/operator/alerts`, `/operator/alerts/[id]` | Açıq və keçmiş həyəcanlar, təsdiq və rədd |
| `/operator/sos`, `/operator/resources` | SOS növbəsi; toplanış nöqtələri və briqadalar |

Aşağıda üç tab və daimi SOS düyməsi var. Yuxarıda bildirişlər: marşrut dəyişikliyi, bağlantı kəsilməsi, «Oflayn ehtiyat marşrut rejimi».

## Quruluş

```
src/
├── app/            # Expo Router marşrutları (yalnız nazik fayllar)
├── design/         # tokens.ts (veb ilə eyni fayl) + theme.ts (RN uyğunlaşdırması)
├── platform/       # yaddaş, geolokasiya, haptika: native.ts
├── ui/             # ortaq komponentlər (veb src/ui ilə eyni adlar və props)
├── map/            # scene.ts (veb ilə eyni) + MapView.tsx (react-native-maps)
├── citizen/        # session.tsx, banner.ts, scene.ts (veb ilə eyni) + ekranlar
├── shell/          # açılış ekranı, başlıq, dil seçimi
└── api/, lib/, i18n/   # veb ilə eyni
```

Vebdən dəyişmədən köçürülən fayllar: `design/tokens.ts`, `api/types.ts`, `lib/*`, `i18n/*.json`, `map/scene.ts`, `citizen/banner.ts`, `citizen/scene.ts`, `citizen/labels.ts`, `citizen/useLocate.ts`, `platform/types.ts`. Kiçik dəyişikliklə: `api/client.ts` (server ünvanı `config.ts`-dən), `i18n/index.ts` (`reloadLocale`), `citizen/session.tsx` (dil dəyişəndə ekranların yenilənməsi). Bu fayllar hələlik iki yerdə saxlanılır; ortaq paketə çıxarmaq növbəti addımdır.

## Vebdən fərqlər

- Xəritə: iOS-da Apple Maps (`react-native-maps`), OpenStreetMap plitələri yox. Maneəli küçələr yalnız vətəndaşın 2,5 km ətrafında çəkilir (native xəritə minlərlə xətt ilə yavaşlayır).
- Yaddaş: `AsyncStorage`; dəyərlər açılışda yaddaşa oxunur, çünki platforma interfeysi sinxrondur.
- Onboarding addımı URL-də yox, komponent vəziyyətində saxlanılır.
- Dispetçer paneli tətbiqin içindədir (`/operator/login`, `/operator/live`, `/operator/alerts`, `/operator/sos`, `/operator/resources`); vebdəki sessiya məntiqi (`operator/session.tsx`, `state.ts`, `scene.ts`) dəyişmədən istifadə olunur. Simulyasiya və audit ekranları mobildə yoxdur.

Server SOS-u sürət həddi və ya dublikat filtri ilə rədd edərsə (`429`), tətbiq vebdəki kimi banner göstərir: neçə saniyədən sonra təkrar cəhd etmək olar və ya bu yerdən SOS-un artıq qəbul olunduğu.

## Hələ yoxdur

Oflayn xəritə plitələri, push bildirişlər, fon rejimində mövqe, Android-də sınaq, avtomatik testlər, mağaza üçün ikon və açılış şəkli (şablondakılar qalıb).
