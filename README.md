# Şəhər Böhranı və Kütləvi Evakuasiya Mühərriki

Şəhər fövqəladə halları (zəlzələ, daşqın, sənaye qəzası, kütləvi tədbirlər) üçün mikro-sistem. Demo şəhəri: **Bakı**.

Böhran zamanı yollar bağlanır, binalar zədələnir, çıxış marşrutlarında tıxac yaranır. Vətəndaş ən yaxın təhlükəsiz toplanış nöqtəsinin nə qədər dolu olduğunu və hansı yolların bağlı olduğunu görmür; dispetçer isə SOS siqnalları içində ən kritik yeri seçməkdə çətinlik çəkir. Bu sistem hər iki tərəfə canlı mənzərə verir. Üç müştərisi var, hamısı eyni backend ilə işləyir:

- **Vətəndaş veb tətbiqi** (`/`, `/app/...`): ən yaxın toplanış nöqtələri, təhlükəsiz marşrut, iki toxunuşla SOS, avtomatik yenidən yönləndirmə. İlk açılışda üç addımlı tanışlıq (`/welcome`), sonrakı açılışlarda birbaşa xəritə (`/app/map`).
- **Vətəndaş mobil tətbiqi** (`mobile/`, React Native + Expo): veb tətbiqlə eyni ekranlar, eyni dizayn tokenləri və eyni sessiya məntiqi. iOS simulyatorunda Expo Go ilə işə salınıb; Android-də və real cihazda sınanmayıb. Ətraflı: [mobile/README.md](mobile/README.md).
- **Dispetçer paneli** (`/operator/...`; veb və mobil tətbiqin daxilində): canlı xəritə, SOS növbəsi, briqadalar, kritik həyəcanlar və bir kliklə qərar.

Köhnə `/citizen` və `/operator` ünvanları işləyir: müvafiq olaraq `/app/map` və `/operator/live` səhifələrinə yönləndirir.

## Mündəricat

1. [Xüsusiyyətlər](#xüsusiyyətlər)
2. [Ekran görüntüləri](#ekran-görüntüləri)
3. [Tələblər](#tələblər)
4. [Docker ilə işə salma](#docker-ilə-işə-salma-bir-əmr)
5. [Docker-siz işə salma](#docker-siz-işə-salma)
6. [Ünvanlar və giriş məlumatları](#ünvanlar-və-giriş-məlumatları)
7. [Mühit dəyişənləri](#mühit-dəyişənləri)
8. [Testlər](#testlər)
9. [Demo ssenarisi addım-addım](#demo-ssenarisi-addım-addım)
10. [Layihə strukturu](#layihə-strukturu)
11. [İstehsalata hazırlıq](#istehsalata-hazırlıq)
12. [Məlum məhdudiyyətlər](#məlum-məhdudiyyətlər)

## Xüsusiyyətlər

### Modul 1: Vətəndaş təhlükəsizliyi

| Funksiya | Təsvir |
|---|---|
| Ən yaxın toplanış nöqtələri | Rayon seçimi, cihazın geolokasiyası və ya xəritəyə toxunmaqla mövqe (toxunuşdan sonra «Bu nöqtəni seç» ilə təsdiqlənir). Nöqtələr **marşrut məsafəsinə** görə sıralanır (düz xətt yox); hər biri üçün növ, doluluq % (yaşıl <70, sarı 70–90, qırmızı >90; rənglə yanaşı sözlə də yazılır), tutum, məsafə və çatma vaxtı göstərilir. Siyahı `/app/points`, nöqtənin təfərrüatı `/app/points/:id` səhifəsindədir. |
| Marşrut | Marşrut **real küçələr üzrə** hesablanır və xəritədə küçənin əyrisi ilə çəkilir. Vətəndaş siyahıdan başqa nöqtə seçib «Bura get» basa bilər. |
| İki toxunuşla SOS | Hər ekranda görünən **SOS** düyməsi dörd böyük təhlükə düyməsini açır (yanğın / uçqun / daşqın / tibbi yardım); birinə toxunmaq siqnalı göndərir. Göndərmədən əvvəl **5 saniyəlik «Ləğv et»** pəncərəsi var (təsadüfi basışa qarşı; «İndi göndər» gözləməni ötürür). Koordinat, zona, növ, vaxt və anonim `citizen_id` (cihazda saxlanan UUID) yazılır. Eyni vətəndaşın 60 saniyə ərzində təkrar SOS-u dublikat yaratmır. |
| «Təhlükəsizəm» | Vətəndaşın açıq SOS siqnallarını bağlayır və paneldə əks olunur. Sonra vətəndaşa növbəti addımlar təklif olunur (yenidən marşrut qur, yenidən yardım çağır). |
| Avtomatik yenidən yönləndirmə | Marşrutdakı yol bağlananda və ya hədəf nöqtə ≥90% dolanda WebSocket ilə bildiriş gəlir: «Marşrut dəyişdi» banneri səbəbi göstərir, yeni nöqtə/yol seçilir və xəritədə yenidən çəkilir. Banner bütün ekranlarda görünür və səhifə yenilənəndə itmir. |
| Simulyasiya edilmiş yol hərəkəti | `POST /api/v1/sim/roads/{edge_id}/close`, `/open`, `GET /api/v1/roads`. |
| **Saxta SOS-dan qorunma** | Panika və ya bot hücumu zamanı yüzlərlə SOS sorğusu eyni anda gələ bilər. SOS endpointi sürət hədləri (bir ünvandan dəqiqədə 30, bir vətəndaşdan 5 sorğu), dublikat filtri (bir ünvandan eyni yer və eyni təhlükə növü yalnız bir dəfə) və xidmət ərazisi yoxlaması ilə qorunur; artıq sorğular bazaya çatmadan `429` ilə rədd edilir və cavabda nə vaxt təkrar cəhd etmək olar yazılır. Ətraflı: [docs/TECHNICAL.md](docs/TECHNICAL.md#7-sui-istifadədən-qorunma-və-giriş-nəzarəti). |
| **Prioritet SOS rolu** | «Hərəkət məhdudiyyətim var / xüsusi qayğıya ehtiyacım var» açarı (tanışlığın üçüncü addımında və «Ayarlar»da). Bu rolda SOS avtomatik **Prioritet №1** alır, marşrut isə yalnız **maneəsiz (panduslu) yollarla** və maneəsiz girişi olan toplanış nöqtələrinə qurulur. Yenidən yönləndirmə də bu profili saxlayır. |
| **Oflayn ehtiyat marşrut rejimi** | Xarici marşrut API-si (OSRM) 503 qaytaranda və ya 5 saniyə cavab verməyəndə sistem dayanmır: circuit breaker işə düşür, məsafə və marşrut son keşlənmiş marşrutdan, lokal küçə bazasından və ya statik koordinat matrisindən hesablanır. Vətəndaşa «Oflayn ehtiyat marşrut rejimi» bildirişi göstərilir və xidmət davam edir. Xəritə fonu yüklənməyəndə də marşrut və nöqtələr görünür. Ətraflı: [docs/TECHNICAL.md](docs/TECHNICAL.md#62-dayanıqlılıq-circuit-breaker-və-ehtiyat-marşrut-rejimi). |
| İki dil | Bütün interfeys Azərbaycan və ingilis dillərində; **AZ / EN** seçimi (vətəndaşda «Ayarlar», dispetçerdə yan panel və giriş səhifəsi) səhifə yenilənmədən dəyişir, seçim yadda saxlanılır. |

### Modul 2: Dispetçer paneli

| Funksiya | Təsvir |
|---|---|
| Canlı xəritə (`/operator/live`) | SOS markerləri (rəng və nişan = təhlükə növü), rayon üzrə sayğac və istilik dairəsi, toplanış nöqtələrinin doluluğu, briqadaların mövqeyi və statusu, qırmızı ilə bağlı yollar. Yola, SOS-a, nöqtəyə və ya briqadaya toxunduqda təfərrüat paneli açılır; heç nə yalnız «hover» ilə göstərilmir. Hamısı WebSocket ilə yenilənir. |
| Qayda A: SOS klasteri | Sürüşən 5 dəqiqəlik pəncərədə **fərqli** `citizen_id`-lərdən ən azı 4 SOS eyni zonada **və ya** 500 m radiusda (haversine) olarsa QIRMIZI həyəcan. |
| Qayda B: həddən artıq dolma | Toplanış nöqtəsinin doluluğu 95%-dən **çox** olarsa QIRMIZI həyəcan. |
| Bir kliklə təsdiq | Açıq QIRMIZI həyəcan panelin **bütün ekranlarında yuxarıda sabit** qalır. «Təsdiqlə»: marşrut məsafəsinə görə ən yaxın **boş** briqada göndərilir, ən yaxın ehtiyat nöqtə açılır, təsirlənən vətəndaşlar yenidən yönləndirilir, audit jurnalına yazılır. Əməliyyat atomardır və təkrar təsdiq idempotentdir. |
| Rədd et | Səbəb göstərməklə həyəcanı bağlayır (audit jurnalına düşür). Açıq və keçmiş həyəcanlar `/operator/alerts` səhifəsindədir. |
| SOS növbəsi (`/operator/sos`) | Bütün açıq SOS-lar bir siyahıda, hərəkət məhdudiyyətli vətəndaşların **Prioritet №1** siqnalları başda; xəritədə pulsasiya edən bənövşəyi əlçatanlıq nişanlı markerlə göstərilir, gələndə səs siqnalı verilir. Növbə yalnız oxumaq üçündür (backend tək SOS-u bağlamağı və ya ona briqada göndərməyi dəstəkləmir). Yanında rayonlar üzrə SOS cədvəli. |
| Resurslar və audit | `/operator/resources`: toplanış nöqtələrinin doluluğu və briqadaların statusu; `/operator/audit`: audit jurnalı. Hadisə lenti canlı xəritənin yan panelindədir və səhifə yenilənəndə itmir. |
| Simulyasiya (`/operator/simulation`) | SOS yaratmaq (o cümlədən prioritet), doluluğu artırmaq, yolları bağlamaq/açmaq, «Zəlzələ ssenarisi». Yalnız `SIM_ENABLED=true` olduqda və `admin` rolu üçün görünür. |
| **JWT və rollar** | Giriş rolu daşıyan JWT (HS256) qaytarır. `observer` paneli yalnız oxuyur; `dispatcher` kritik əməliyyatları icra edir (həyəcanı təsdiqləmək, yəni xilasetmə briqadasını göndərmək; rədd etmək; briqada statusunu dəyişmək); `admin` əlavə olaraq simulyasiyanı və yolların bağlanmasını idarə edir. Rolun icazəsi olmayan düymələr paneldə göstərilmir, server isə `403` qaytarır. |
| **Yük altında işlək panel** | Saxta SOS axını paneli bloklamır: qəbul edilən siqnalların sayı hədlərlə məhduddur, SOS növbəsi ən çoxu 100 sətir, xəritə ən çoxu 300 SOS markeri çəkir (sayğaclar dəqiq qalır), WebSocket mesajları 100 ms-dən bir toplu tətbiq olunur. 500 paralel bağlantı ilə 60 000 saxta SOS zamanı orta cavab müddəti 45 ms, panel sorğusu 68 ms olub (hədd: 399 ms). |

### Arxitektura

Hexagonal quruluş (`domain` / `services` / `adapters` / `api` / `realtime`), daxili hadisə şini, qoşula bilən qayda mühərriki, `RoutingProvider` interfeysi (simulyasiya + OSRM), bütün hədlər konfiqurasiyada, `/api/v1` versiyalaşdırma, vahid xəta formatı, i18n (`az.json`). Ətraflı: [docs/TECHNICAL.md](docs/TECHNICAL.md). İnterfeysin dizayn sistemi (tokenlər, ortaq komponentlər, platforma adapterləri, mobil tətbiq üçün bələdçi): [docs/DESIGN.md](docs/DESIGN.md). Süni intellektdən istifadə hesabatı: [docs/AI_REPORT.md](docs/AI_REPORT.md).

## Ekran görüntüləri

Fayllar `docs/screenshots/` qovluğundadır.

**Vətəndaş veb tətbiqi**

| Xəritə və cari marşrut | Toplanış nöqtələri | SOS | Oflayn ehtiyat marşrut rejimi |
|---|---|---|---|
| ![Xəritə və marşrut](docs/screenshots/citizen-map.png) | ![Toplanış nöqtələri](docs/screenshots/citizen-points.png) | ![SOS](docs/screenshots/citizen-sos.png) | ![Ehtiyat rejim](docs/screenshots/citizen-fallback.png) |
| Hədəf nöqtə, məsafə, vaxt və doluluq aşağıdakı vərəqdə | Marşrut məsafəsinə görə sıralanmış siyahı | Dörd təhlükə düyməsi, 5 saniyəlik ləğv pəncərəsi | Xarici marşrut API-si işləmədikdə bildiriş, marşrut lokal bazadan |

**Dispetçer paneli**

| Canlı xəritə | QIRMIZI həyəcan |
|---|---|
| ![Canlı xəritə](docs/screenshots/operator-live.png) | ![QIRMIZI həyəcan](docs/screenshots/operator-alert.png) |
| SOS markerləri, nöqtələr, briqadalar, hadisə lenti | Bütün ekranlarda yuxarıda sabit qalan zolaq: «Təsdiqlə» və «Rədd et» |

| SOS növbəsi | Resurslar |
|---|---|
| ![SOS növbəsi](docs/screenshots/operator-sos.png) | ![Resurslar](docs/screenshots/operator-resources.png) |
| Prioritet №1 başda, rayonlar üzrə cədvəl | Toplanış nöqtələrinin doluluğu, briqadaların statusu |

**Vətəndaş mobil tətbiqi (iOS simulyatoru)**

| Tanışlıq | Xəritə | SOS | Dispetçer girişi |
|---|---|---|---|
| ![Tanışlıq](docs/screenshots/mobile-welcome.png) | ![Xəritə](docs/screenshots/mobile-map.png) | ![SOS](docs/screenshots/mobile-sos.png) | ![Dispetçer girişi](docs/screenshots/mobile-operator-login.png) |
| Dil → mövqe → xüsusi qayğı rolu | Apple Maps üzərində marşrut və vərəq | Dörd təhlükə düyməsi |

## Tələblər

| Yol | Lazımdır |
|---|---|
| Docker ilə | Docker 24+ və Docker Compose v2 |
| Docker-siz | Python 3.11+, Node.js 20+, npm, GNU Make (istəyə görə) |
| Mobil tətbiq | Node.js 20+, npm; iOS üçün macOS, Xcode və iOS simulyatoru, yaxud telefonda Expo Go |

Veb xəritənin plitələri OpenStreetMap-dən, mobil xəritə Apple Maps-dən yükləndiyi üçün internet bağlantısı lazımdır.

## Docker ilə işə salma (bir əmr)

```bash
docker compose up --build
```

Sonra brauzerdə `http://localhost:5173` açın. Konfiqurasiyanı dəyişmək üçün `.env.example` faylını `.env` kimi köçürün (məcburi deyil, standart dəyərlərlə işləyir).

5173 və ya 8000 portu məşğuldursa:

```bash
FRONTEND_PORT=5180 BACKEND_PORT=8010 docker compose up --build
```

## Docker-siz işə salma

Make ilə:

```bash
cp .env.example .env     # istəyə görə
make dev                 # asılılıqları qurur, backend (8000) və frontend (5173) işə salır
```

Make olmadan (iki terminal):

```bash
# 1-ci terminal: backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --reload --port 8000

# 2-ci terminal: frontend
cd frontend
npm install
npm run dev
```

Windows-da `.venv/bin/` əvəzinə `.venv\Scripts\` yazın. Vite 5173 portu məşğul olarsa avtomatik növbəti boş portu seçir və ünvanı terminalda göstərir.

Backend ilk işə düşəndə `backend/data/evac.db` (SQLite) yaradır və Bakı üçün demo məlumatı ilə doldurur: 8 zona, 15 toplanış nöqtəsi (3-ü ehtiyat), 8 briqada və **Bakının real küçə şəbəkəsi** (OpenStreetMap: 4 509 kəsişmə, 7 051 küçə hissəsi, real küçə adları ilə). Şəbəkə `backend/app/adapters/db/data/baku_roads.json` faylındadır; yeniləmək üçün: `python3 scripts/build_road_graph.py` (Python 3.10+, internet lazımdır). Yol məlumatı © OpenStreetMap töhfəçiləri, ODbL lisenziyası.

### Mobil tətbiq

Backend işləməlidir (yuxarıdakı kimi, 8000 portunda). Sonra:

```bash
cd mobile && npm install && npx expo start --ios
```

Əmr iOS simulyatorunu açır, lazım olsa Expo Go-nu quraşdırır və tətbiqi işə salır. Simulyatorda `localhost` backend-in işlədiyi Mac-dir. Real telefon, simulyatorun mövqeyi və quruluş haqqında: [mobile/README.md](mobile/README.md).

## Ünvanlar və giriş məlumatları

| Nə | Ünvan |
|---|---|
| Vətəndaş tətbiqi | http://localhost:5173/ (ilk dəfə `/welcome`, sonra `/app/map`) |
| Dispetçer paneli | http://localhost:5173/operator (giriş: `/operator/login`, sonra `/operator/live`) |
| API sənədləri (Swagger) | http://localhost:8000/docs |
| OpenAPI sxemi | http://localhost:8000/api/v1/openapi.json |

**Demo hesabları:**

| İstifadəçi adı | Parol | Rol | Nə edə bilər |
|---|---|---|---|
| `operator` | `baku2026` | `admin` (`OPERATOR_ROLE` ilə dəyişir) | Hər şey: oxumaq, həyəcanı təsdiqləmək/rədd etmək, briqada statusu, simulyasiya və yolları bağlamaq |
| `observer` | `baku2026-view` | `observer` | Yalnız oxumaq (parol boşdursa hesab söndürülür) |

Üçüncü rol `dispatcher`-dir: oxumaq və kritik əməliyyatlar (təsdiq, rədd, briqada statusu), simulyasiyasız; `OPERATOR_ROLE=dispatcher` ilə sınamaq olar. Giriş 8 saatlıq JWT qaytarır. Skriptlər üçün statik xidmət tokeni də işləyir (`demo-operator-token`, `admin` rolu). Bunlar yalnız demo üçündür: istehsalatda `JWT_SECRET`-i dəyişin, `OPERATOR_TOKEN`-i boş qoyun və parolları `.env` faylında təyin edin. Giriş səhifəsi demo hesablarını yalnız `SIM_ENABLED=true` olduqda göstərir. Vətəndaş tətbiqi anonimdir; dispetçer girişinə vətəndaş tətbiqinin «Ayarlar» səhifəsindən də keçmək olar.

Səhifələr:

| Vətəndaş | Nə üçündür |
|---|---|
| `/welcome` | İlk açılış: dil → mövqe (geolokasiya və ya rayon) → xüsusi qayğı rolu |
| `/app/map` | Xəritə və cari marşrut |
| `/app/points`, `/app/points/:id` | Toplanış nöqtələrinin siyahısı və təfərrüatı («Bura get») |
| `/app/sos` | SOS göndərmək, statusu, «Təhlükəsizəm» |
| `/app/settings` | Rol, dil, məxfilik qeydi, dispetçer girişi |

| Dispetçer | Nə üçündür |
|---|---|
| `/operator/login` | Giriş |
| `/operator/live` | Canlı xəritə və qısa vəziyyət zolağı |
| `/operator/alerts`, `/operator/alerts/:id` | Açıq və keçmiş həyəcanlar, təsdiq və rədd |
| `/operator/sos` | SOS növbəsi (Prioritet №1 başda) |
| `/operator/resources` | Toplanış nöqtələri və briqadalar |
| `/operator/audit` | Audit jurnalı |
| `/operator/simulation` | Simulyasiya alətləri (yalnız `SIM_ENABLED=true`) |

Naməlum ünvanlar «Səhifə tapılmadı» ekranını göstərir.

## Mühit dəyişənləri

Bütün dəyişənlər `.env.example` faylındadır. Prioritet: mühit dəyişəni > `.env` > YAML faylı (`CONFIG_FILE`, nümunə: `config.example.yaml`) > standart dəyər.

| Dəyişən | Standart | Təsvir |
|---|---|---|
| `APP_ENV` | `development` | `production` olduqda backend demo sirləri ilə işə düşmür (bax: [İstehsalata hazırlıq](#istehsalata-hazırlıq)) |
| `DATABASE_URL` | `sqlite:///./data/evac.db` | SQLAlchemy ünvanı. PostgreSQL: `postgresql+psycopg://user:pass@host:5432/evac` |
| `CORS_ORIGINS` | `http://localhost:5173,...` | İcazəli mənbələr (vergüllə) |
| `SEED_ON_START` | `true` | Boş bazanı demo məlumatı ilə doldur |
| `CONFIG_FILE` | `config.yaml` | İstəyə görə YAML konfiqurasiya faylı |
| `OPERATOR_USERNAME` | `operator` | Demo operator adı |
| `OPERATOR_PASSWORD` | `baku2026` | Demo operator parolu |
| `OPERATOR_TOKEN` | `demo-operator-token` | Skriptlər üçün statik xidmət tokeni (`admin` rolu); boş dəyər onu söndürür |
| `OPERATOR_ROLE` | `admin` | Operator hesabının rolu: `admin`, `dispatcher` və ya `observer` |
| `OBSERVER_USERNAME` / `OBSERVER_PASSWORD` | `observer` / `baku2026-view` | Yalnız oxuma hüquqlu hesab; parol boşdursa söndürülür |
| `JWT_SECRET` | `demo-jwt-secret-change-me` | JWT imza açarı (HS256); istehsalatda uzun təsadüfi dəyər olmalıdır |
| `JWT_TTL_MIN` | `480` | JWT sessiyasının müddəti (dəq) |
| `LOGIN_RATE_PER_IP` | `10` | Bir ünvandan dəqiqədə giriş cəhdi |
| `SOS_RATE_WINDOW_S` | `60` | SOS sürət hədlərinin pəncərəsi (s) |
| `SOS_RATE_PER_CITIZEN` | `5` | Bir vətəndaş id-sindən pəncərə ərzində SOS sorğusu |
| `SOS_RATE_PER_IP` | `30` | Bir müştəri ünvanından pəncərə ərzində SOS sorğusu |
| `SOS_FLOOD_SAME_SPOT` | `1` | Dublikat filtri: bir ünvanın eyni yeri və təhlükə növünü pəncərədə bildirə biləcəyi say (0 = söndürülür) |
| `SOS_FLOOD_PRECISION` | `4` | «Eyni yer» üçün koordinatın onluq dəqiqliyi (4 ≈ 10 m) |
| `SOS_GLOBAL_PER_WINDOW` | `0` | Yük atma: hamıdan pəncərə ərzində qəbul edilən SOS (0 = hədd yoxdur) |
| `SOS_MAX_DISTANCE_KM` | `60` | Şəhər mərkəzindən bu məsafədən uzaq SOS rədd edilir |
| `CITY_CENTER_LAT` / `CITY_CENTER_LNG` | `40.4` / `49.87` | Xidmət ərazisinin və xəritənin mərkəzi |
| `TRUST_FORWARDED_FOR` | `false` | `X-Forwarded-For` başlığına etibar; yalnız onu özü yazan proksi arxasında `true` |
| `ROUTING_PROVIDER` | `simulated` | `simulated` və ya `osrm` |
| `OSRM_BASE_URL` | `https://router.project-osrm.org` | OSRM serveri |
| `OSRM_PROFILE` | `foot` | OSRM profili |
| `OSRM_TIMEOUT_S` | `5` | Xarici marşrut API-sinin cavabı üçün gözləmə müddəti (s); aşıldıqda uğursuzluq sayılır |
| `ROUTING_BREAKER_FAILURES` | `3` | Circuit breaker-in açılması üçün ardıcıl uğursuzluq sayı |
| `ROUTING_BREAKER_RESET_S` | `30` | Açıq breaker-in sınaq sorğusuna (half-open) keçməsinə qədər fasilə (s) |
| `ROUTING_STATIC_DETOUR` | `1.35` | Statik koordinat matrisində düz xətt məsafəsinin vurulduğu əmsal |
| `WALK_SPEED_MPS` | `1.4` | Piyada sürəti (çatma vaxtı üçün), m/s |
| `ACCESSIBLE_SPEED_MPS` | `0.9` | Maneəsiz profil (əlil arabası) üçün sürət, m/s |
| `BRIGADE_SPEED_MPS` | `12` | Briqada sürəti, m/s |
| `NEAREST_LIMIT` | `5` | Göstərilən ən yaxın nöqtələrin sayı |
| `SOS_CLUSTER_RADIUS_M` | `500` | Qayda A: radius (m) |
| `SOS_CLUSTER_WINDOW_MIN` | `5` | Qayda A: sürüşən pəncərə (dəq) |
| `SOS_CLUSTER_MIN_COUNT` | `4` | Qayda A: minimum fərqli vətəndaş sayı |
| `REROUTE_OCCUPANCY_PCT` | `90` | Bu həddə (≥) vətəndaş başqa nöqtəyə yönləndirilir |
| `CRITICAL_OCCUPANCY_PCT` | `95` | Qayda B: bu həddən çox (>) olduqda həyəcan |
| `ALERT_COOLDOWN_MIN` | `10` | Eyni həyəcanın təkrar yaranmaması üçün fasilə (dəq) |
| `OCCUPANCY_YELLOW_PCT` / `OCCUPANCY_RED_PCT` | `70` / `90` | Doluluq rəng hədləri |
| `SOS_DEDUP_WINDOW_S` | `60` | Təkrar SOS basışı üçün pəncərə (s) |
| `SIM_ENABLED` | `true` | Simulyasiya API-sini aktiv et |
| `BRIGADE_SIM_ENABLED` | `true` | Yoldakı briqadaları xəritədə hərəkət etdir |
| `BRIGADE_TICK_S` / `BRIGADE_SIM_SPEEDUP` | `2` / `8` | Hərəkət addımı (s) və demo sürətləndirməsi |
| `API_URL` | `http://localhost:8000` | `scripts/simulate.py` üçün backend ünvanı |
| `VITE_BACKEND_URL` | `http://localhost:8000` | Yalnız `npm run dev`: proksi hədəfi |
| `FRONTEND_PORT` / `BACKEND_PORT` | `5173` / `8000` | Yalnız Docker Compose: xarici portlar |

## Testlər

```bash
make test
# və ya
cd backend && .venv/bin/python -m pytest -q
```

137 test (yaddaşdaxili SQLite, saxta saat; təxminən 55 saniyə):

| Fayl | Nəyi yoxlayır |
|---|---|
| `test_rule_sos_cluster.py` | Qayda A: 3 fərqli SOS → həyəcan yox; 4 fərqli → var; eyni vətəndaşdan 4 → yox; 6 dəqiqəyə yayılmış 4 → yox; müxtəlif zonalarda 500 m daxilində 4 → var; sürüşən pəncərə; radius dedup |
| `test_rule_overcrowding.py` | Qayda B: 95% → yox, 95,1% → var; qeyri-aktiv nöqtə; qayda registri |
| `test_alert_engine.py` | Dedup və cooldown, 60 s SOS dublikat qoruması, «Təhlükəsizəm» |
| `test_routing.py` | Marşrutun küçə həndəsəsi ilə getməsi; mövqenin ən yaxın küçəyə bağlanması; bağlı küçənin vətəndaşı «cib»də saxlamaması; bağlı yollardan yan keçmə; hədəf ≥90% olduqda alternativ nöqtə; yol olmadıqda səliqəli cavab; OSRM adapteri (saxta nəqliyyat) |
| `test_routing_resilience.py` | Xarici marşrut API-si 503 qaytaranda və ya vaxt aşımında sistemin dayanmaması; circuit breaker-in açılması, açıq ikən xarici sorğu göndərilməməsi, half-open sınağı və bərpa; ehtiyat zənciri (keş → lokal qraf → statik matris); planda `routing_mode` və `fallback_source` |
| `test_sos_abuse.py` | Saxta SOS axını: 600 sorğudan yalnız ünvan kvotası qədəri (30) qəbul olunur, qalanı `429` və orta müddət 399 ms-dən az; `Retry-After`; eyni yerin yeni vətəndaş id-ləri ilə təkrarı `duplicate_signal`; vətəndaşın öz təkrarı mövcud SOS-u qaytarır; pəncərə keçəndə hədd qalxır; xidmət ərazisindən kənar mövqe; `X-Forwarded-For`-a yalnız etibarlı proksi arxasında inanılması; qlobal hədd; axından dərhal sonra təsdiqin (briqada göndərilməsinin) işləməsi |
| `test_auth_rbac.py` | Giriş rol daşıyan JWT qaytarır; saxtalaşdırılmış imza, vaxtı bitmiş token və `alg=none` → 401; `observer` oxuyur, lakin təsdiq, rədd, briqada statusu və simulyasiyada 403 alır; `dispatcher` təsdiqləyir (briqada göndərilir), `/sim/reset`-də 403; `admin` hamısını edir; audit qeydində icraçı JWT subyektidir; giriş cəhdlərinin sürət həddi; WebSocket JWT-ni qəbul edir; `/auth/me` |
| `test_production_guard.py` | `APP_ENV=production`: demo sirlər, statik token və ya açıq simulyasiya ilə işə düşmür; düzgün konfiqurasiya ilə işə düşür |
| `test_alert_confirmation.py` | Briqada göndərilir, ehtiyat nöqtə açılır, audit yazılır, təkrar təsdiq idempotentdir, xəta zamanı heç nə dəyişmir (atomarlıq) |
| `test_reroute.py` | Yol bağlanması, nöqtənin dolması və həyəcan təsdiqi ilə yenidən yönləndirmə; briqadanın hərəkəti |
| `test_api.py` | HTTP və WebSocket müqaviləsi, xəta formatı, operator auth, tam ssenari |
| `test_priority_role.py` | Rol siyasəti; prioritet SOS (№1) və siyahıda birinci olması; maneəsiz marşrutun yalnız əlçatan yol və nöqtələrdən keçməsi; standart marşrutdan fərqi; əlçatan yol olmadıqda səliqəli cavab; yenidən yönləndirmədə profilin saxlanması; köhnə baza sxeminin yenidən qurulması |

Frontend: `cd frontend && npm run typecheck && npm run build`. Mobil tətbiq: `cd mobile && npx tsc --noEmit`. Frontend və mobil tətbiq üçün avtomatik test yoxdur.

### Yük sınağı

`scripts/loadtest.py` işləyən backend-ə saxta SOS axını göndərir (hər sorğuda yeni vətəndaş id-si), eyni vaxtda dispetçerin SOS siyahısını sorğulayır və orta cavab müddəti 399 ms-ə çatarsa 1 kodu ilə bitir. Yalnız standart kitabxanadan istifadə edir.

```bash
cd backend && .venv/bin/uvicorn app.main:app --port 8000 --no-access-log   # istehsalata yaxın rejim
make loadtest ARGS='--requests 60000 --connections 500'
python3 scripts/loadtest.py --requests 20000 --connections 1000 --same-spot  # eyni yerin təkrarı (dublikat filtri)
```

Ölçülən nəticə (tək worker, fayl SQLite, MacBook): 500 paralel bağlantı ilə 60 000 saxta SOS 5,5 saniyədə (təxminən 11 000 sorğu/s); 30-u qəbul olundu (201), 59 970-i rədd edildi (429).

| | Orta | Median | p95 | Maks |
|---|---|---|---|---|
| SOS endpointi | 45 ms | 38 ms | 91 ms | 185 ms |
| Dispetçer paneli (axın zamanı `GET /sos`) | 68 ms | — | 113 ms | 184 ms |

`--same-spot` ilə 1000 bağlantıdan 20 000 sorğunun hamısı rədd edildi, orta 109 ms. `make dev` rejimində (`--reload` və hər sorğunun jurnala yazılması ilə) rəqəmlər pisdir; sınağı yuxarıdakı kimi işə salın.

## Demo ssenarisi addım-addım

Hazırlıq: iki brauzer pəncərəsi açın (yan-yana).

1. **Vətəndaş pəncərəsi** — `http://localhost:5173/`. İlk açılışda tanışlıq üç addımdır: dili seçin → rayon siyahısından **Yasamal** seçin (və ya «Mövqeyimi paylaş») → xüsusi qayğı rolunu hələlik söndürülmüş saxlayıb marşrutu göstərən düyməni basın. Xəritə açılır, mavi marşrut artıq çəkilib; aşağıdakı vərəqdə hədəf nöqtə, məsafə, vaxt və doluluq görünür. Sonrakı açılışlarda tətbiq birbaşa `/app/map` səhifəsinə düşür.
2. **Dispetçer pəncərəsi** — `http://localhost:5173/operator`, `operator` / `baku2026` ilə daxil olun.
3. Yan paneldə **Simulyasiya** səhifəsini açın, **Zəlzələ ssenarisi → «Ssenarini başlat»** düyməsini basın (və ya terminalda `make scenario`) və **Canlı xəritə**yə qayıdın. Ssenari əvvəlcə sistemi sıfırlayır, sonra təxminən 2 dəqiqə ərzində:

| № | Vaxt | Nə baş verir | Nəyə baxmalı |
|---|---|---|---|
| 1 | 0:03 | Yasamalda 3 SOS | Xəritədə markerlər, rayon sayğacı 3; həyəcan **yoxdur** (həd 4) |
| 2 | 0:13 | 3 yol bağlanır (biri vətəndaşın marşrutunda) | Paneldə qırmızı yollar; vətəndaşda «Marşrut dəyişdi» banneri: hansı yol bağlandı |
| 3 | 0:25 | Daha 2 SOS → **Qayda A** | Səs siqnalı və bütün ekranlarda yuxarıda sabit qalan QIRMIZI həyəcan zolağı. **«Təsdiqlə»** basın: briqada yola düşür (qara qırıq xətt), ehtiyat nöqtə açılır, audit jurnalı dolur; vətəndaşa bildiriş gəlir |
| 4 | 0:43 | Hərəkət məhdudiyyətli vətəndaşdan **Prioritet SOS (№1)** | «SOS növbəsi»ndə başda, xəritədə bənövşəyi əlçatanlıq nişanlı marker, səs siqnalı |
| 5 | 0:51 | Vətəndaşın hədəf nöqtəsi 80%-ə çatır | Doluluq zolağı sarı olur («Resurslar» səhifəsi və vətəndaşın vərəqi) |
| 6 | 0:57 | Həmin nöqtə 91% | Vətəndaşda «Marşrut dəyişdi» banneri: «…» dolub (91%), yeni nöqtə göstərilir |
| 7 | 1:11 | Həmin nöqtə 96% → **Qayda B** | İkinci QIRMIZI həyəcan; «Təsdiqlə» və ya «Rədd et» (səbəblə) |
| 8 | 1:29 | Nəsimi–Nərimanov sərhədində 4 SOS (hər zonada 2) | Zona üzrə həd keçilmir, amma 500 m radius işə düşür → üçüncü həyəcan |
| 9 | 1:47 | Bütün yollar açılır | Qırmızı yollar itir |

4. **Prioritet rolu:** vətəndaş pəncərəsində **Ayarlar** səhifəsini açıb «Hərəkət məhdudiyyətim var / xüsusi qayğıya ehtiyacım var» açarını yandırın və **Xəritə**yə qayıdın. Marşrut bənövşəyi «Maneəsiz marşrut»a çevrilir və qırıq xətlə göstərilən maneəli yollardan yan keçir; Yasamal üçün hədəf də dəyişir, çünki ən yaxın «Zabitlər parkı»nın maneəsiz girişi yoxdur. İndi **SOS** basıb təhlükə növünü seçin: dispetçerin «SOS növbəsi»ndə «Prioritet SOS (№1)» kimi görünür.
5. **Dil:** vətəndaşda **Ayarlar**, dispetçerdə yan paneldəki **AZ / EN** seçimi ilə interfeysi dəyişin.
6. **SOS:** vətəndaş pəncərəsində aşağıdakı **SOS** düyməsini basın, dörd təhlükə düyməsindən birini seçin. 5 saniyə ərzində «Ləğv et» ilə ləğv etmək, «İndi göndər» ilə dərhal göndərmək olar. Sonra **«Təhlükəsizəm»** basın: paneldə SOS markeri yaranır və bağlanır, «Təhlükəsiz» sayğacı artır.
7. **Yol bağlamaq:** dispetçerin canlı xəritəsində istənilən küçəyə (və ya yaxınlığına) toxunun; açılan paneldə **«Yolu bağla»** / **«Yolu aç»** düyməsini basın.

Hissələri əl ilə göstərmək üçün (panel düymələri və ya skript):

```bash
python3 scripts/simulate.py sos --zone yasamal --count 4      # Qayda A
python3 scripts/simulate.py sos --zone nizami --count 1 --priority   # Prioritet №1 SOS
python3 scripts/simulate.py occupancy --point 2 --to 96       # 90%, sonra 95% həddi
python3 scripts/simulate.py roads --close 3                   # təsadüfi yollar
python3 scripts/simulate.py roads --edge e0017 --close        # konkret yol (id: GET /api/v1/roads)
python3 scripts/simulate.py roads --open-all
python3 scripts/simulate.py scenario --speed 2                # ssenari iki dəfə sürətli
python3 scripts/simulate.py status
python3 scripts/simulate.py reset
```

Canlı xəritədə yola toxunub açılan paneldən də onu bağlamaq/açmaq olar (dəqiq xəttin üstünə düşmək lazım deyil). API ilə birbaşa:

```bash
curl -X POST http://localhost:8000/api/v1/sim/roads/e0017/close \
     -H "Authorization: Bearer demo-operator-token"
curl http://localhost:8000/api/v1/roads
```

## Layihə strukturu

```
evac-engine/
├── backend/
│   ├── app/
│   │   ├── domain/        # saf məntiq: modellər, hadisələr, geo, qaydalar, portlar
│   │   ├── services/      # istifadə ssenariləri (SOS, evakuasiya, həyəcan, simulyasiya…)
│   │   ├── adapters/      # db (SQLAlchemy), routing, eventbus, notifications
│   │   ├── api/           # /api/v1 routerləri, sxemlər, xəta formatı, auth
│   │   ├── realtime/      # WebSocket meneceri və hadisə şini körpüsü
│   │   ├── config.py      # bütün hədlər və parametrlər
│   │   ├── container.py   # composition root
│   │   └── main.py
│   └── tests/
├── frontend/src/
│   ├── design/            # tokens.ts (rəng, şrift, ölçü… tək mənbə) → CSS dəyişənləri
│   ├── platform/          # yaddaş, geolokasiya, vibrasiya, səs, WebSocket ünvanı üçün adapterlər
│   ├── ui/                # ortaq komponentlər və SVG nişanlar
│   ├── map/               # xəritə səhnəsi modeli (məlumat) və Leaflet renderi
│   ├── shell/             # başlanğıc ekranı, başlıq, dil seçimi, «tapılmadı»
│   ├── citizen/           # /welcome və /app/...: sessiya, ekranlar
│   ├── operator/          # /operator/...: sessiya, ekranlar
│   ├── i18n/az.json, en.json  # bütün interfeys mətnləri (iki dil)
│   └── api/, lib/         # tipli klient, formatlama, WebSocket hook
├── mobile/                # vətəndaş mobil tətbiqi (Expo, React Native)
│   └── src/
│       ├── app/           # Expo Router marşrutları
│       ├── design/, api/, i18n/, lib/   # veb ilə eyni fayllar (surət)
│       ├── platform/      # AsyncStorage, expo-location, expo-haptics adapterləri
│       ├── ui/, shell/    # ortaq komponentlərin React Native versiyası
│       ├── map/           # eyni səhnə modeli + react-native-maps renderi
│       └── citizen/       # eyni sessiya + ekranlar
├── scripts/simulate.py        # demo ssenariləri və əl ilə simulyasiya
├── scripts/loadtest.py        # saxta SOS axını ilə yük sınağı
├── scripts/build_road_graph.py
├── docs/TECHNICAL.md, docs/DESIGN.md, docs/AI_REPORT.md
├── docs/screenshots/          # README-dəki ekran görüntüləri
├── docker-compose.yml, Makefile, .env.example, config.example.yaml
```

## İstehsalata hazırlıq

`APP_ENV=production` qoyulduqda backend konfiqurasiyanı yoxlayır və aşağıdakılardan biri pozulubsa **işə düşmür** (səbəbləri sadalayan xəta ilə). Demo dəyərləri repozitoriyadadır, yəni hamıya məlumdur.

| Yoxlanılır | Tələb |
|---|---|
| `JWT_SECRET` | Standart dəyər olmamalı, ən azı 32 simvol |
| `OPERATOR_PASSWORD` | Demo dəyəri (`baku2026`) olmamalı |
| `OBSERVER_PASSWORD` | Demo dəyəri olmamalı (yeni parol və ya hesabı söndürmək üçün boş) |
| `OPERATOR_TOKEN` | Boş olmalı (statik xidmət tokeni söndürülür) |
| `SIM_ENABLED` | `false` (simulyator bütün məlumatı sıfırlaya bilir) |
| `CORS_ORIGINS` | Saytın real ünvanı; `localhost` olmamalı |

Bundan əlavə, əl ilə:

- Backend-i tək worker ilə və giriş jurnalı olmadan işə salın: `uvicorn app.main:app --port 8000 --no-access-log` (hadisə şini, WebSocket qeydiyyatı və sürət məhdudlaşdırıcısı proses daxilindədir).
- 8000 portunu yalnız proksiyə açın. `TRUST_FORWARDED_FOR=true` yalnız `X-Forwarded-For` başlığını özü yazan proksi arxasında qoyulmalıdır (Docker-dəki nginx belə edir); port birbaşa açıqdırsa başlığı saxtalaşdırıb sürət həddindən yayınmaq olar. `docker-compose.yml` demo üçün 8000 portunu birbaşa da açır.
- TLS proksidə qurulmalıdır (bu repozitoriyada sertifikat konfiqurasiyası yoxdur).
- Verilənlər bazası: `DATABASE_URL` ilə PostgreSQL nəzərdə tutulub, lakin **sınanmayıb**.

Demo səviyyəsində qalanlar (istehsalatdan əvvəl həll edilməlidir): hesablar konfiqurasiyadadır (istifadəçi bazası, parol heşi, tokenin geri çağırılması yoxdur); baza miqrasiyaları yoxdur və köhnə sxem aşkarlananda baza silinib yenidən qurulur; hadisə şini və məhdudlaşdırıcı proses daxilindədir, yəni bir neçə replika ilə işləmir; frontend və mobil tətbiq üçün avtomatik test yoxdur.

## Məlum məhdudiyyətlər

Qısa siyahı (tam siyahı və istehsalat yol xəritəsi: [docs/TECHNICAL.md](docs/TECHNICAL.md#12-məlum-məhdudiyyətlər)):

- Yol şəbəkəsi realdır (OpenStreetMap), lakin həyət yolları daxil edilməyib, bir istiqamətli hərəkət və tıxac nəzərə alınmır; mövqedən ən yaxın küçəyə qədər hissə düz xətlə göstərilir. Ən yaxın küçədən 750 m-dən uzaq yer (məsələn, dəniz) əlçatmaz sayılır.
- Hadisə şini və WebSocket qeydiyyatı proses daxilindədir: backend **tək worker** ilə işləməlidir.
- Dispetçer girişi JWT və rollarla qorunur, lakin hesablar konfiqurasiyadadır (istifadəçi bazası, parol heşi, tokenin geri çağırılması yoxdur) və skriptlər üçün statik xidmət tokeni standart olaraq açıqdır. Vətəndaş API-si anonimdir: SOS sürət hədləri ünvan üzrədir, ona görə hər biri bir inandırıcı SOS göndərən çoxünvanlı botneti dayandırmır, ortaq ünvan (operator NAT-ı) arxasındakı real vətəndaşlar isə bir kvotanı bölüşür.
- Baza miqrasiyaları (Alembic) yoxdur: sxem köhnədirsə backend işə düşəndə bazanı avtomatik silib demo məlumatı ilə yenidən qurur (real məlumat üçün yararsızdır).
- Yolların və nöqtələrin «maneəsiz» olması demo fərziyyəsidir (kiçik küçələrin bir hissəsi, ümumi şəbəkənin təxminən 19%-i, təsadüfi «maneəli» işarələnib; magistral yollar həmişə maneəsizdir), real əlçatanlıq məlumatı deyil. Rol özünü-bəyandır, təsdiqlənmir.
- Serverdən gələn bəzi adlar (rayon, toplanış nöqtəsi) xüsusi isim olduğu üçün hər iki dildə eyni qalır.
- Mobil tətbiq yalnız iOS simulyatorunda Expo Go ilə işə salınıb; Android, real cihaz və mağaza yığımı sınanmayıb. Dispetçer paneli mobil tətbiqin içindədir (Ayarlar → «Dispetçer girişi»): giriş, canlı xəritə, həyəcanlar (təsdiq və rədd), SOS növbəsi və resurslar native ekranlardır; simulyasiya və audit jurnalı yalnız vebdədir. Mobil panelin giriş ekranı simulyatorda açılıb, qalan ekranları yalnız tip yoxlamasından keçib. Mobil tətbiq vebdəki ortaq faylların surətini saxlayır (ortaq paket yoxdur).
- PostgreSQL, ictimai OSRM və Docker yığımı (yenilənmiş nginx konfiqurasiyası ilə) bu dəyişikliklərdən sonra canlı sınanmayıb.
