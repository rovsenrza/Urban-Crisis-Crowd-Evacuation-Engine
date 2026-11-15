# Süni intellektdən istifadə hesabatı

Layihə: Şəhər Böhranı və Kütləvi Evakuasiya Mühərriki.

> **Şəffaflıq qeydi.** Bu hesabatın özü də süni intellekt tərəfindən yazılıb. Aşağıda «yoxlanılıb» deyilən hər şey Sİ-nin özünün apardığı yoxlamadır (testlər, işə salma, brauzerdə sınaq). İnsan tərəfindən sətir-sətir kod baxışı **aparılmayıb**; 4-cü bölmədəki cədvəl layihə müəllifi tərəfindən doldurulmalıdır.

## 1. İstifadə olunan alətlər

| Alət | Rolu |
|---|---|
| **Claude Code** (Anthropic), model: Claude Fable 5.2 | Arxitektura, bütün mənbə kodu, testlər, sənədlər, işə salma və sınaq |
| Claude in Chrome (brauzer avtomatlaşdırması) | İşləyən tətbiqin brauzerdə yoxlanması: giriş, panel, vətəndaş tətbiqi, ssenari |
| Claude Code-un paralel alt-agentləri (eyni model) | Sonrakı mərhələlərdə müstəqil hissələr paralel yazılıb: dil faylları, dispetçer üslubları, sənədlər, JWT/rollar, müştəri dəyişiklikləri, mobil komponentlər və ekranlar. Nəticələri əsas sessiya birləşdirib və yoxlayıb |
| `design-taste-frontend` bacarığı (Claude Code skill) | Yalnız palitra və şrift cütünün seçimi, token və mətn qaydaları üçün; marketinq səhifəsi qaydaları tətbiq edilməyib |
| pytest, TypeScript kompilyatoru, Vite, Docker Compose, Expo (Metro) və iOS simulyatoru, `scripts/loadtest.py` | Sİ-nin çıxışını yoxlamaq üçün istifadə olunan adi alətlər (Sİ deyil) |

Başqa Sİ aləti (kod tamamlayıcı, şəkil generatoru və s.) istifadə olunmayıb. Kodda Sİ modelinə iş vaxtı müraciət yoxdur: sistem tam deterministik qaydalarla işləyir.

## 2. Hansı hissələrdə istifadə olunub

| Hissə | Sİ-nin payı | Qeyd |
|---|---|---|
| Arxitektura | Tam | Hexagonal quruluş, hadisə şini, qayda mühərriki tapşırıqda tələb olunmuşdu; konkret dizayn qərarlarını (server tərəfli yenidən yönləndirmə, vəziyyətsiz marşrut provayderi, asinxron endpoint + sinxron DB) Sİ verib |
| Backend kodu | Tam | `backend/app/` |
| Frontend kodu | Tam | `frontend/src/`, dizayn daxil. Sonradan tam yenidən qurulub: dizayn tokenləri, ortaq komponentlər, platforma adapterləri, sessiya anbarları, iç-içə marşrutlar |
| Mobil tətbiq | Tam | `mobile/` (Expo, React Native): vətəndaş tətbiqi və onun içində dispetçer paneli (giriş, canlı xəritə, həyəcanlar, SOS növbəsi, resurslar); daşına bilən fayllar vebdən surətdir |
| Dayanıqlılıq və təhlükəsizlik | Tam | Circuit breaker və ehtiyat marşrut, SOS sürət hədləri və dublikat filtri, JWT və rollar, yük altında sürət düzəlişləri, `APP_ENV=production` yoxlaması |
| Demo məlumatı | Tam | Bakı zonaları, toplanış nöqtələri, briqadalar: koordinatlar və tutumlar Sİ-nin yaddaşından təxmini verilib, rəsmi mənbə ilə **yoxlanılmayıb** |
| Testlər | Tam | 137 pytest testi; yük sınağı skripti (`scripts/loadtest.py`) |
| Sənədlər | Tam | README, TECHNICAL, DESIGN, `mobile/README.md`, bu hesabat |
| Azərbaycan dilində mətnlər | Tam | İnterfeys və sənədlər; dil redaktəsi aparılmayıb |

## 3. İstifadə olunan promptlar

**Əsas prompt (bir dəfə verilib).** Layihənin tam spesifikasiyası ingilis dilində tək mesajla verilib. Strukturu:

- *ROLE:* «senior full-stack engineer and software architect… Build a complete, working, demo-ready prototype from scratch.»
- *PROJECT:* problem təsviri, demo şəhəri Bakı, seed məlumatı tələbləri.
- *TECH STACK:* FastAPI, Pydantic v2, SQLAlchemy 2 + SQLite, WebSocket, `RoutingProvider` (simulated + OSRM), React + Vite + TypeScript + Leaflet, docker-compose, pytest.
- *ARCHITECTURE REQUIREMENTS:* hexagonal quruluş, hadisə şini və 7 hadisə, `AlertRule` qayda mühərriki, hədlər konfiqurasiyada, təhlükə registri, API versiyalaşdırma, i18n.
- *MODULE 1 / MODULE 2:* vətəndaş və dispetçer funksiyaları, Qayda A və Qayda B-nin dəqiq tərifi, təsdiq əməliyyatı.
- *DEMO SIMULATOR, TESTS, DELIVERABLES, WORK PLAN, QUALITY BAR.*

Əsas prompt layihənin tapşırıq mətni ilə eynidir, ona görə burada tam təkrarlanmır.

**Sonrakı mesajlar** (Azərbaycan dilində):

1. Docker ilə bağlı iki qısa mesaj: niyə işə düşmədiyi sualı və onu yenidən yoxlayıb qaldırmaq xahişi.
2. Marşrutların real yollarla getmədiyi barədə şikayət; real yol məlumatının mənbəyi soruşulduqda istifadəçi OpenStreetMap şəbəkəsini seçdi.
3. Yeni tələb: «Hərəkət məhdudiyyətli şəxs / xüsusi qayğıya ehtiyacı olan vətəndaş» (Prioritet SOS) rolu: bu rolda SOS avtomatik Priority #1 almalı, sistem yalnız əlil arabası / tibbi nəqliyyat üçün əlçatan (panduslu və maneəsiz) marşrut təyin etməli; bundan əlavə bütün interfeys Azərbaycan və ingilis dillərində dinamik dəyişdirilə bilməlidir.
4. Frontendin yenidən qurulması (ingilis dilində uzun brif): əvvəlcədən təsdiqlənmiş audit və naviqasiya quruluşu (vətəndaş üçün alt tab paneli və daimi SOS, dispetçer üçün yan panel), dizayn tokenləri, ortaq komponentlər, platforma adapterləri, hər ekran üçün yüklənmə / boş / xəta vəziyyətləri, «backend-ə toxunma» məhdudiyyəti və yoxlanılmalı funksiyaların siyahısı.
5. İşin yavaş getdiyi barədə irad: işi paralel hissələrə bölmək tələbi.
6. Yeni tələb: xarici xəritə və marşrutlaşdırma API-si 503 qaytaranda və ya 5 saniyə cavab verməyəndə sistem çökməməli, circuit breaker və ehtiyat mexanizmi işə düşməli, hesablamalar lokal ehtiyat bazadan (statik koordinat matrisi və ya son keşlənmiş marşrutlar) aparılmalı və istifadəçiyə «oflayn ehtiyat marşrut rejimi» bildirişi göstərilməlidir.
7. Mobil tətbiq: `mobile` qovluğunda React Native ilə tam tətbiq qurmaq və sonda iOS simulyatorunda işə salmaq.
8. Yeni tələb: panika və ya bot hücumu nəticəsində eyni anda 500-dən çox saxta SOS sorğusu. SOS endpointləri sürət həddi və dublikat filtri ilə qorunmalı, saxta sorğular dispetçer panelini bloklamamalı, kritik əməliyyatlar (xilasetmə briqadasının yönləndirilməsi) JWT / rol əsaslı giriş nəzarəti ilə qorunmalı, kütləvi sorğular zamanı orta cavab müddəti 399 ms-dən aşağı qalmalıdır.
9. Yekun düzəlişlər: istifadəçinin ekran görüntüləri ilə göstərdiyi üç görünüş qüsuru (5-ci bölmə, 33-cü bənd), sənədlərin yekunlaşdırılması və istehsalata hazırlıq.

## 4. Nə olduğu kimi qəbul edilib, nə yoxlanılıb, nə dəyişdirilib

### 4.1 Sİ-nin öz yoxlaması

| Yoxlama | Nəticə |
|---|---|
| Backend testləri (`pytest`) | 137 testdən 137-si keçir |
| Frontend tip yoxlaması və yığım (`tsc`, `vite build`) | Xətasız |
| Lokal işə salma (uvicorn + Vite) | İşləyir |
| Brauzerdə dispetçer paneli | Giriş, canlı yeniləmə, QIRMIZI banner, «Təsdiqlə», audit jurnalı, simulyasiya paneli, «Zəlzələ ssenarisi» yoxlanılıb |
| Brauzerdə vətəndaş tətbiqi | Rayon seçimi, marşrut, SOS, «Təhlükəsizəm», hər üç səbəblə yenidən yönləndirmə banneri yoxlanılıb (masaüstü və 390 px en) |
| Docker Compose | İlk mərhələdə yığılıb və işə salınıb; nginx üzərindən API, səhifələr, WebSocket və tam ssenari yoxlanılıb. Sonrakı dəyişikliklərdən (yeni frontend, `X-Forwarded-For` yazan nginx konfiqurasiyası) sonra **yenidən yığılmayıb** |
| `scripts/simulate.py` | `roads`, `scenario`, `status`, `sos --priority` əmrləri işlədilib |
| Prioritet rolu (brauzerdə) | Rol açarı, bənövşəyi maneəsiz marşrut, hədəf nöqtənin dəyişməsi, «Priority #1» SOS, paneldə prioritet növbəsi və markeri yoxlanılıb |
| Dil dəyişdirici (brauzerdə) | AZ ↔ EN keçidi vətəndaş tətbiqində və paneldə səhifə yenilənmədən, vəziyyət itmədən yoxlanılıb; iki dil faylının açarları və yer tutucuları skriptlə müqayisə edilib |

Yuxarıdakı brauzer sətirləri ilk interfeysə aiddir. Sonrakı mərhələlərin yoxlaması:

| Yoxlama | Nəticə |
|---|---|
| Yenidən qurulmuş frontend (brauzerdə, masaüstü və 390 px en) | Vətəndaş: rayonla tanışlıq və çəkilmiş marşrut, xüsusi qayğı rolu (bənövşəyi marşrut, başqa hədəf, maneəli küçələr), SOS geri sayımı və göndərilməsi, nöqtə dolanda yenidən yönləndirmə banneri, «Təhlükəsizəm», yeniləmədən sonra marşrutun bərpası. Dispetçer: giriş, sabit QIRMIZI həyəcan, bir kliklə təsdiq, yolu seçib bağlamaq, həyəcan tarixçəsi, SOS növbəsi, doluluq zolaqları, ölü backend ilə xəta ekranı |
| Yenidən qurulmuş frontenddə **yoxlanılmayanlar** | Cihaz geolokasiyası, 60 saniyə ərzində ikinci SOS, yol bağlanması və həyəcan təsdiqi bannerləri, kəsilmiş bağlantıdan sonra bərpa, səbəblə rədd, çıxış və vaxtı bitmiş token, simulyasiya ekranının düymələri (simulyator skriptdən işlədilib) |
| Ehtiyat marşrut rejimi | 13 test (503, vaxt aşımı, breaker-in açılması və bərpası, keş, statik matris). Ölü OSRM ünvanı ilə işləyən backend-də dörd ardıcıl plan sorğusu 200 qaytarıb; brauzerdə bildiriş və lokal qrafdan çəkilmiş marşrut görünüb. Real 5 saniyəlik vaxt aşımı və plitə nasazlığı qeydi canlı sınanmayıb |
| Sui-istifadədən qorunma və rollar | 10 + 11 test. Brauzerdə `observer` hesabı ilə: simulyasiya menyusu görünmür, briqada statusu sadə mətndir, server `/sim/reset`-ə 403 qaytarır |
| Yük sınağı (`scripts/loadtest.py`) | Ayrı, giriş jurnalı söndürülmüş serverdə 500 paralel bağlantı ilə 60 000 saxta SOS: SOS endpointi orta 45 ms, axın zamanı dispetçer sorğusu orta 68 ms (hədd 399 ms). Düzəlişlərdən əvvəl həmin dispetçer sorğusu orta 1100 ms idi |
| Mobil tətbiq | `tsc --noEmit` xətasız; Metro iOS paketini yığır; iOS simulyatorunda Expo Go ilə açılıb (tanışlığın birinci ekranı görünüb). Xəritə, nöqtələr və SOS ekranları dərin keçidlərlə açılıb şəkli çəkilib; istifadəçi sınayıb üç görünüş qüsuru bildirib (düzəldilib). Mobil dispetçer panelinin giriş ekranı simulyatorda açılıb; giriş tələb edən ekranları Sİ simulyatorda gəzə bilməyib (toxunuş və mətn daxil etmə imkanı yoxdur), onlar yalnız tip yoxlamasından keçib |
| `APP_ENV=production` yoxlaması | 3 test: demo sirləri ilə işə düşmür, düzgün konfiqurasiya ilə işə düşür |

Sİ tərəfindən **yoxlanılmayanlar:** PostgreSQL; canlı ictimai OSRM; Android, real mobil cihaz və real geolokasiya; yeni nginx konfiqurasiyası ilə Docker yığımı; çoxünvanlı (paylanmış) bot axını (yük sınağı bir ünvandan gəlir); axın zamanı həyəcan təsdiqinin müddəti (yalnız oxu sorğusu ölçülüb); səs siqnalının eşidilməsi; `make dev` əmrinin özü (ekvivalent əmrlər ayrı-ayrı işlədilib); Windows.

### 4.2 İnsan tərəfindən baxış (müəllif doldurmalıdır)

| Hissə | Baxılıb? | Olduğu kimi qəbul / dəyişdirilib | Qeyd |
|---|---|---|---|
| Böhran qaydaları (`domain/alerts/rules/`) | ☐ | | |
| Təsdiq əməliyyatı (`services/alert_decision.py`) | ☐ | | |
| Marşrutlaşdırma (`adapters/routing/`) | ☐ | | |
| API və auth (`api/`) | ☐ | | |
| Frontend (`frontend/src/`) | ☐ | | |
| Demo məlumatının düzgünlüyü (koordinatlar, adlar) | ☐ | | |
| Rollar və maneəsiz marşrut (`domain/roles.py`, `services/evacuation.py`) | ☐ | | |
| İngilis dilində mətnlər (`i18n/en.json`) | ☐ | | |
| Azərbaycan dilində mətnlər | ☐ | | |
| Sənədlər | ☐ | | |
| Dizayn sistemi və ortaq komponentlər (`frontend/src/design`, `ui`) | ☐ | | |
| Circuit breaker və ehtiyat marşrut (`adapters/routing/resilient.py`) | ☐ | | |
| SOS müdafiəsi (`services/sos_guard.py`, `api/shield.py`) | ☐ | | |
| JWT və rollar (`services/auth.py`, `api/deps.py`) | ☐ | | |
| Mobil tətbiq (`mobile/src/`) | ☐ | | |
| İstehsalat konfiqurasiyası (`config.py`, `.env`) | ☐ | | |

## 5. Sİ çıxışında aşkar edilən problemlər və həlli

İnkişaf zamanı Sİ-nin ilk variantında tapılan və düzəldilən real qüsurlar:

| № | Problem | Necə tapıldı | Həll |
|---|---|---|---|
| 1 | `RouteIn` sxemində `lat`/`lng` «istəyə görə» nəzərdə tutulsa da məcburi idi; yalnız rayonla sorğu 422 qaytarırdı | API testi | `Field(default=None, …)` |
| 2 | Marşrut vətəndaşı əvvəlcə ən yaxın kəsişməyə **geriyə** aparırdı (2,5 km), sonra irəli | Brauzerdə xəritəyə baxış | Mövqe yol seqmentinə proyeksiya olunur (1,6 km); yeni test əlavə edildi |
| 3 | Yol bağlananda köhnə hədəf saxlanılırdı, halbuki dolama yolun üstündə daha yaxın nöqtə var idi | Brauzerdə sınaq | `manual_target` bayrağı: yalnız vətəndaşın özü seçdiyi hədəf saxlanılır; əks halda yeni ən yaxşı nöqtə |
| 4 | QIRMIZI banner xəritədə klasterin özünü örtürdü | Brauzerdə sınaq | Xəritə həyəcana fokuslanır və nöqtəni bannerdən aşağı sürüşdürür |
| 5 | Həyəcan mətnində «5 dəqiqə» sabit yazılmışdı (konfiqurasiya dəyişsə yanlış olardı) | Kodun təkrar oxunması | Dəyər `/meta` hədlərindən gəlir |
| 6 | Hadisələrin çatdırılma sırası: müştəri `citizen.rerouted` mesajını `road.changed`-dən əvvəl alırdı | Dizayn baxışı | Şin əvvəlcə ümumi abunəçilərə (WebSocket), sonra tipə görə abunəçilərə çatdırır |
| 7 | Ssenaridə «dolan nöqtə» seçimi bərabərlik halında təsadüfi idi | Canlı ssenari (ikinci istifadəçi sessiyası ilə) | Bərabərlikdə ən son yenilənən marşrut üstün tutulur |
| 8 | Minlik ayırıcı brauzerin dil məlumatından asılı idi («2,125» ilə «34,3%» qarışırdı) | Brauzerdə sınaq | Açıq formatlama (dar boşluq) |
| 9 | Zona adları markerlərin altında qalırdı; bildiriş xəritə izahını örtürdü; «≈ 1 saat 0 dəq» | Brauzerdə sınaq | Yerləşdirmə və format düzəlişləri |
| 10 | `vite.config.ts` tip yoxlamasında `process` tapılmırdı | `tsc` | Fayl tip yoxlamasından çıxarıldı |
| 11 | Sxemə sütun əlavə edildikdə işləyən baza «no such column» xətası verdi | Server jurnalı | Baza yenidən yaradıldı; miqrasiya olmaması məhdudiyyət kimi sənədləşdirildi |
| 12 | Docker Desktop işə düşmürdü (layihədən asılı olmayan səbəb: əvvəlki «no space left on device» xətasından sonra ilişmişdi) | Docker jurnalı | Yenidən başladıldı; yığım sınandı |

İkinci mərhələdə (rol və iki dil) tapılanlar:

| № | Problem | Necə tapıldı | Həll |
|---|---|---|---|
| 13 | Maneəsiz şəbəkə «bağlı» idi, amma kövrək: tək bir yolun bağlanması əlil arabalı vətəndaşı tam təcrid edirdi | Yeni test (yenidən yönləndirmə) | Seed maneəli yolu yalnız şəbəkədə «körpü» yaranmırsa işarələyir; test əlavə edildi |
| 14 | Rol kartı növbəti başlığın üstünə çıxırdı | Brauzerdə sınaq | Flex sıxılması söndürüldü |
| 15 | Dil dəyişəndə lentdəki köhnə yazılar, bildirişlər və xəta mətnləri əvvəlki dildə qalacaqdı | Dizayn baxışı | Mətn əvəzinə render funksiyası saxlanılır; server mətnləri kod üzrə tərcümə olunur |
| 16 | `az.json` faylının əvvəlində artıq `ko` simvolları var idi (redaktorda təsadüfi daxil edilib), JSON pozulmuşdu | `tsc` | Prefiks silindi; qalan məzmun dəyişdirilmədi |

Üçüncü mərhələdə (real yol şəbəkəsi) tapılanlar:

| № | Problem | Necə tapıldı | Həll |
|---|---|---|---|
| 17 | **Marşrutlar absurd trayektoriya ilə gedirdi, real küçələrlə yox.** Səbəb Sİ-nin ilk dizayn qərarı idi: tapşırıqdakı «60–120 düyünlü simulyasiya qrafı» hərfi yerinə yetirilmiş, təxminən 1,6 km addımlı sintetik tor qurulmuşdu | **İstifadəçi tərəfindən** (əl ilə sınaq) | Bakının real küçə şəbəkəsi OpenStreetMap-dən götürüldü (istifadəçinin razılığı ilə), marşrut mühərriki küçə həndəsəsi ilə işləyəcək şəkildə yenidən yazıldı |
| 18 | Yanındakı küçə bağlananda vətəndaş ən yaxın açıq küçəyə bağlanırdı, o isə çıxışsız «cib» ola bilirdi: marşrut tapılmırdı | Mövcud test real şəbəkədə uğursuz oldu | Mövqe bir neçə yaxın küçəyə namizəd kimi bağlanır, girişi axtarış seçir |
| 19 | Bir neçə namizəd olanda alqoritm uzaq küçəyə düz xətlə «kəsə yol» seçirdi (eyni absurd xəttin başqa forması) | Yeni testlər | Küçədən kənar yeriş üçün 3 qat cərimə |
| 20 | 7 min yolu React elementləri ilə çəkmək paneli ləngidərdi | Dizayn baxışı | Canvas qatı, yalnız dəyişən yollar yenilənir |

17-ci bənd bu hesabat üçün ən vacib dərsdir: bütün testlər keçirdi və Sİ-nin öz brauzer yoxlaması da problemi «məhdudiyyət» kimi qeyd edib keçmişdi, halbuki istifadəçi üçün bu, ciddi qüsur idi. Sİ-nin özünü yoxlaması insan sınağını əvəz etmir.

Dördüncü mərhələdə (frontendin yenidən qurulması, dayanıqlılıq, mobil tətbiq, təhlükəsizlik) tapılanlar:

| № | Problem | Necə tapıldı | Həll |
|---|---|---|---|
| 21 | Panelin ilk sorğusu uğursuz olanda ekran əbədi «Yüklənir…» göstərirdi: xəta bildirişi yalnız yüklənmiş panelin içində çəkilirdi | Yenidənqurma brifindəki audit | Yüklənmə və xəta vəziyyəti çərçivə səviyyəsində; «Yenidən cəhd et» düyməsi |
| 22 | SOS bir toxunuşla, əvvəlcədən seçilmiş «Tibbi yardım» ilə göndərilirdi: təsadüfi siqnal çox asan idi | Audit | İki toxunuş və göndərməzdən əvvəl 5 saniyəlik ləğv pəncərəsi |
| 23 | Ləğv pəncərəsinin taymeri React StrictMode-da SOS-u iki dəfə göndərə bilərdi (vəziyyət yeniləyicisinin içində yan təsir) | Kodun təkrar oxunması | Göndəriş ref üzərindən bir dəfə |
| 24 | Dublikat filtrinin ilk dizaynı («eyni koordinatdan ən çoxu 3 SOS») rayon seçən real vətəndaşları bloklayardı: onların hamısının koordinatı rayon mərkəzidir | Dizayn baxışı, kod yazılmazdan əvvəl | Filtr «ünvan + yer + təhlükə növü» üzrədir; vətəndaşın öz təkrarı servisin mövcud dedup-una ötürülür |
| 25 | `/dashboard/snapshot` və `/roads` hər sorğuda 7 051 küçə hissəsini bazadan oxuyub seriyalaşdırırdı: təxminən 300 ms və bu müddətdə hadisə dövrəsi bloklanırdı | Yük sınağından əvvəl ölçmə | Yaddaşda hazır (və sıxılmış) nüsxə; snapshot 27 ms, `/roads` 3 ms |
| 26 | İlk yük sınağı həddi keçdi (orta 556 ms), halbuki qəbul edilən SOS serverdə 2 ms çəkirdi. Boş `/health` də 100 paralel bağlantıda orta 181 ms verirdi: ağır test müştərisi öz növbəsini ölçürdü, rədd isə tam framework yığınından keçirdi | Profilləşdirmə və müqayisə ölçməsi | Rədd xam ASGI qatında; yük sınağı yüngül müştəri ilə yenidən yazıldı |
| 27 | Axın zamanı dispetçer sorğusu orta 1100 ms çəkirdi, yəni panel bloklanırdı: dispetçer endpointləri və auth asılılıqları sinxron idi və iş axını hovuzunda dolu hadisə dövrəsinə uduzurdu | Düzəldilmiş yük sınağı | Endpointlər və asılılıqlar `async`; 68 ms |
| 28 | Vaxt ölçən test bəzən uğursuz olurdu: ilk snapshot yol keşinin qurulmasını da ödəyirdi | Testin təkrar işlədilməsi | Keş server işə düşəndə qurulur; test onu ölçmədən əvvəl isidir |
| 29 | Docker-dəki nginx `X-Forwarded-For` yazmırdı: bütün müştərilər bir sürət kvotasını bölüşəcəkdi | Sənəd yazan alt-agentin konfiqurasiyanı oxuması | nginx başlığı yazır, Compose `TRUST_FORWARDED_FOR=true` verir (Docker-də sınanmayıb) |
| 30 | Expo şablonunda React Compiler açıq idi; o, `t()` çağırışlarını saf sayıb keşləyə bilərdi və dil dəyişməsi «donardı» | Konfiqurasiyanın oxunması | Söndürüldü; sessiya provayderi dil dəyişəndə ekranları yeniləyir |
| 31 | Sİ «Expo Go yükləndi» siqnalının gəldiyini düşündü, halbuki jurnalın son sətri Sİ-nin öz paket sınağı ilə dəyişmişdi | Simulyatorun ekran görüntüsü | Gözləmə şərti tətbiqin simulyatorda quraşdırılmasına bağlandı; yanlış siqnal istifadəçiyə açıq deyildi |
| 32 | Alt-agentə verilən test sayı səhv idi (135; əslində 134) | Tam test dəstinin nəticəsi | Düzəliş alt-agentə göndərildi |
| 33 | Vebdə vərəq düymələrinin yazısı üç sətrə düşürdü; mobildə «Təhlükəsizəm» hərf-hərf bölünürdü; mobil ekran başlıqları məzmunla eyni hizada deyildi | **İstifadəçi tərəfindən** (ekran görüntüləri ilə) | Düymələr sığmadıqda alt-alta düzülür; mobil başlığa məzmunla eyni yan boşluq verildi |

33-cü bənd 17-ci bəndin dərsini təkrarlayır: Sİ vebdəki yazıların sarılmasını brauzerdə görmüş və «hələ kobud» kimi qeyd edib keçmişdi, mobil ekranları isə ümumiyyətlə gəzməmişdi.

Layihədə qalan, Sİ-nin bildiyi zəif yerlər 6-cı bölmədə və [TECHNICAL.md](TECHNICAL.md#12-məlum-məhdudiyyətlər)-də sadalanıb.

## 6. Məhdudiyyətlər

- **Müstəqil baxış yoxdur.** Kodu yazan və yoxlayan eyni Sİ-dir. Testlər də eyni mənbədəndir, yəni tələbin yanlış başa düşülməsi həm kodda, həm testdə eyni cür təkrarlana bilər.
- **Tələblərin şərhi.** Bəzi yerlərdə Sİ özü qərar verib: Qayda A-da yalnız açıq SOS-lar sayılır; radius siqnal mərkəzli dairələrlə yoxlanılır; «60–120 düyün və til» həm düyün (68), həm til (118) üçün ödənilib; simulyasiya endpointləri `admin` rolu tələb edir; yolların bağlanması simulyator API-sində qaldığı üçün `dispatcher` rolu yol bağlaya bilmir; SOS-un ləğv pəncərəsi göndərişi gecikdirir (göndərilmiş siqnalı geri götürən endpoint yoxdur).
- **Demo məlumatı qismən uydurma/təxminidir.** Yol şəbəkəsi realdır (OpenStreetMap), lakin yolların əlçatanlığı uydurmadır; toplanış nöqtələrinin koordinatları, tutumları və «sığınacaq» statusu real deyil. Bu məlumatla real qərar vermək olmaz.
- **Frontend və mobil tətbiq üçün avtomatik test yoxdur**; yalnız tip yoxlaması və əl ilə (Sİ tərəfindən) brauzer sınağı. Mobil tətbiqin ekranlarını Sİ simulyatorda gəzməyib.
- **Yük sınağının hədləri.** Yük yalnız bir ünvandan, tək prosesli serverdə, bir kompüterdə ölçülüb; müştəri və server eyni maşındadır. Çoxünvanlı axın, uzunmüddətli yük və davamlılıq sınanmayıb.
- **Paralel alt-agentlər.** Hissələr eyni modelin paralel nüsxələri tərəfindən yazılıb və əsas sessiya tərəfindən birləşdirilib; bu, müstəqil baxış deyil və nüsxələr arasında uyğunsuzluq (məsələn, 32-ci bənd) yarada bilir.

## 7. Fövqəladə hal sistemi üçün etik və təhlükəsizlik mülahizələri

1. **Bu, prototipdir, real əməliyyat sistemi deyil.** İnsan həyatı ilə bağlı sistemdə Sİ-nin yazdığı kod müstəqil mühəndis baxışı, təhlükəsizlik auditi, yük testi və sahə təlimləri olmadan istifadə edilməməlidir.
2. **Qərarı insan verir.** Sistem həyəcanı aşkarlayır və tədbir təklif edir, lakin briqada yalnız dispetçer «Təsdiqlə» basdıqdan sonra göndərilir; hər qərar (kim, nə vaxt, nə icra olundu) audit jurnalına yazılır. Avtomatik göndəriş bilərəkdən əlavə edilməyib.
3. **Yanlış həyəcan və buraxılmış həyəcan.** Hədlər (4 siqnal, 500 m, 5 dəq, 95%) tapşırıqdan götürülüb, real məlumatla kalibrlənməyib. Yanlış həyəcan resursu boşa aparır, buraxılmış həyəcan isə daha təhlükəlidir; hədlər konfiqurasiyadadır ki, mütəxəssis dəyişə bilsin.
4. **Sui-istifadə.** SOS anonimdir. Sürət hədləri və dublikat filtri bir ünvandan gələn axını dayandırır, lakin bir ünvanın dəqiqəlik kvotası (30) Qayda A-nın həddindən (4) böyükdür: bir nəfər hələ də saxta `citizen_id`-lərlə klaster həyəcanı yarada bilər, hər biri bir inandırıcı SOS göndərən çoxünvanlı botnet isə ümumiyyətlə dayandırılmır. Əks risk də var: ortaq ünvan (operator NAT-ı) arxasındakı real vətəndaşlar bir kvotanı bölüşür və böhranda rədd cavabı ala bilər. İstehsalatda cihaz təsdiqi, SMS təsdiqi və anomaliya aşkarlanması lazımdır; hədlər real trafikə görə kalibrlənməlidir.
5. **Məxfilik.** Yalnız anonim UUID, koordinat və təhlükə növü saxlanılır; ad, telefon yoxdur. Bununla belə dəqiq koordinat özü həssas məlumatdır: saxlama müddəti, giriş hüququ və şifrələmə istehsalatda müəyyən edilməlidir.
6. **Yanlış istiqamətləndirmə riski.** Yol şəbəkəsi real olsa da natamamdır və yüklənmə anına aiddir; yanlış və ya köhnəlmiş marşrut insanı təhlükəyə apara bilər. Marşrut həmişə «tövsiyə» kimi təqdim edilməli, rəsmi xilasedici göstərişi üstün olmalıdır.
7. **Əlçatanlıq və bərabərlik.** Tətbiq internet, smartfon və Azərbaycan dili tələb edir. Yaşlılar, əlilliyi olan şəxslər, turistlər və bağlantısı olmayanlar kənarda qalmamalıdır: SMS/Cell Broadcast, başqa dillər, ekran oxuyucu dəstəyi və təkərli kürsü üçün marşrut profili yol xəritəsindədir.
8. **Prioritet rolu və ədalət.** Rol özünü-bəyandır: yoxlanılmır, ona görə sui-istifadə edilə bilər və real ehtiyacı olanların növbəsini uzada bilər; istehsalatda sosial qeydiyyatla (könüllü, razılıqla) əlaqələndirmə lazımdır. Eyni zamanda «hərəkət məhdudiyyəti» sağlamlıq məlumatıdır: indi yalnız anonim identifikatorla saxlanılır, lakin koordinatla birlikdə həssasdır. Maneəsiz marşrut uydurma məlumata əsaslanır; real sistemdə yanlış «maneəsiz» işarəsi əlil arabalı insanı keçilməz yerə apara bilər, ona görə bu məlumat sahədə yoxlanılmalıdır.
9. **Sİ-yə həddən artıq etibar.** İşləyən demo və keçən testlər düzgünlüyün sübutu deyil. Bu hesabatdakı 4.2 cədvəli doldurulmadan layihə «insan tərəfindən yoxlanılmış» sayılmamalıdır.
