# Təqdimat mətni (hər slayd üçün qısa çıxış)

Hər slayd təxminən 20–30 saniyədir; bütün çıxış 7–8 dəqiqə çəkir.

**1. Başlıq**
Salam, biz Team 15-ik. Layihəmiz Bakı üçün böhran və kütləvi evakuasiya sistemidir: vətəndaş tətbiqi və dispetçer paneli, həm vebdə, həm mobildə.

**2. Problem**
Böhran anında iki sual cavabsız qalır. Vətəndaş hara getməli olduğunu bilmir: nöqtə doludurmu, yol açıqdırmı. Dispetçer isə yüzlərlə SOS içində ən kritik yeri seçə bilmir. Biz hər ikisinə canlı mənzərə veririk.

**3. Arxitektura**
Quruluş hexagonal-dır: nüvə sabit qalır, baza, marşrut provayderi və bildiriş kanalı adapter kimi dəyişir. Modullar bir-biri ilə yalnız hadisə şini üzərindən danışır. Marşrut serverdə hesablanır, müştəri sadəcə hazır planı çəkir; mobil tətbiqi də məhz buna görə tez qura bildik.

**4. Vətəndaş: marşrut**
Vətəndaş bir baxışda hara getməli olduğunu görür. Marşrut Bakının real küçələri üzrədir. Doluluq həm rənglə, həm sözlə göstərilir. Yol bağlananda və ya nöqtə 90% dolanda marşrut özü dəyişir. Hərəkət məhdudiyyəti olanlar üçün yalnız maneəsiz yollar seçilir.

**5. SOS**
SOS iki toxunuşdur: düymə, sonra təhlükə növü. Sonra 5 saniyəlik geri sayım gəlir, səhv toxunuşu ləğv etmək olur. Əvvəl bir toxunuşla gedirdi və təsadüfi siqnal çox asan idi.

**6. Dispetçer: canlı xəritə**
Dispetçer hər şeyi bir xəritədə görür: SOS-lar, nöqtələr, briqadalar, bağlı yollar. Qırmızı həyəcan hər ekranın yuxarısında sabit qalır, onu gözdən qaçırmaq mümkün deyil. İstənilən obyektə toxunanda təfərrüatı açılır.

**7. Həyəcan qaydaları**
Həyəcan iki halda yaranır. Birincisi: 5 dəqiqədə 4 fərqli vətəndaşdan SOS, eyni rayonda və ya 500 metr radiusda. İkincisi: nöqtə 95%-dən çox dolanda. Hədlər konfiqurasiyadadır, yeni qayda isə bir fayl əlavə etməklə qoşulur.

**8. Bir kliklə qərar**
Dispetçer «Təsdiqlə» basır və sistem hər şeyi bir əməliyyatda edir: ən yaxın boş briqada yola düşür, ehtiyat nöqtə açılır, vətəndaşlar yönləndirilir, audit yazılır. SOS növbəsində Prioritet №1 həmişə başdadır.

**9. Rollar**
Giriş JWT ilədir və üç rol var. Müşahidəçi yalnız baxır, dispetçer qərar verir, admin simulyasiyanı da idarə edir. İcazəsi olmayan üçün düymə gizlənir, server də 403 qaytarır. Hər qərar auditdə qalır.

**10. Dayanıqlılıq**
Xarici marşrut API-si çöksə, sistem dayanmır. Üç nasazlıqdan sonra dövrə açılır və sorğu daha getmir, yəni vətəndaş timeout gözləmir. Marşrut ehtiyat zəncirindən gəlir: keş, lokal yol qrafı, son çarə kimi düz xətt. Ölü API ilə plan 15–40 millisaniyəyə hazır olur.

**11. Hücuma qarşı**
60 min saxta SOS göndərdik, 500 paralel bağlantı ilə. Cəmi 30-u qəbul olundu. SOS endpointi orta 45, dispetçer paneli hücum zamanı 68 millisaniyə cavab verdi; hədd 399 idi. Düzəlişdən əvvəl panel 1100 millisaniyə çəkirdi.

**12. Mobil tətbiq**
Mobil tətbiq React Native ilə yazılıb və vebdəki məntiqi paylaşır: tokenlər, sessiya, API, dillər. Xəritə native-dir. Dispetçer paneli də tətbiqin içindədir.

**13. Canlı demo**
İndi 2 dəqiqəlik zəlzələ ssenarisini göstərəcəyik. Üç SOS gəlir, həyəcan yoxdur. Yollar bağlanır, marşrut dəyişir. Beşinci SOS-da qırmızı həyəcan yaranır və biz onu təsdiqləyirik. Sonra Prioritet №1 siqnalı və nöqtənin dolması ilə ikinci həyəcan.

**14. Süni intellekt**
Kod, testlər və sənədlər Claude Code ilə yazılıb, bunu açıq deyirik. Sistemin özündə iş vaxtı süni intellekt yoxdur, qaydalar deterministikdir. Bizim rolumuz tapşırıq vermək, sınamaq və qüsurları tapmaq idi. Qərarı sistemdə də insan verir.

**15. Yekun**
Nəticə: 137 test keçir, üç müştəri işləyir, yük altında orta cavab 399 millisaniyədən xeyli aşağıdır.

**16. Sual-Cavab**
Diqqətinizə görə təşəkkür edirik. Suallarınızı cavablandırmağa hazırıq.
