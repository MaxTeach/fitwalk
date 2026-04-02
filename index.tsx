import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform, TextInput, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard, Alert, ActionSheetIOS, Dimensions, Linking, Modal, AppState } from 'react-native';
import * as Location from 'expo-location';
// expo-speech rimosso (Step 1+5): tutta l'audio è gestita da ElevenLabs MP3
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
// Apple Health: richiede build nativo (non funziona in Expo Go)
// Si attiva automaticamente con EAS Build / Xcode
let AppleHealthKit: any = null;
if (Platform.OS === 'ios') {
  try {
    const { NativeModules } = require('react-native');
    const HKNative = NativeModules.AppleHealthKit;
    if (HKNative && typeof HKNative.initHealthKit === 'function') {
      // Aggiunge Constants manualmente — react-native-health li espone separatamente
      AppleHealthKit = {
        ...HKNative,
        Constants: {
          Permissions: {
            Steps: 'Steps',
            DistanceWalkingRunning: 'DistanceWalkingRunning',
            ActiveEnergyBurned: 'ActiveEnergyBurned',
            Weight: 'BodyMass',
            Height: 'Height',
            Workout: 'Workout',
          }
        }
      };
      console.log('[HK] ✅ AppleHealthKit pronto da NativeModules');
    } else {
      console.warn('[HK] ❌ NativeModules.AppleHealthKit non ha initHealthKit');
    }
  } catch(e) {
    console.warn('[HK] ❌ errore:', e);
  }
}
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Video, ResizeMode } from 'expo-av';
import { Pedometer } from 'expo-sensors';
import MapView, { Polyline, Marker } from 'react-native-maps';
import Svg, { Rect as SvgRect } from 'react-native-svg';

// Watch connectivity: condizionale come HealthKit
let WatchModule: any = null;
try {
  const w = require('react-native-watch-connectivity');
  if (w && w.sendMessage) {
    WatchModule = w;
    console.log('[Watch] ✅ modulo disponibile');
  }
} catch(e) {
  console.log('[Watch] modulo non disponibile (normale in Expo Go)');
}
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart, BarChart } from 'react-native-chart-kit';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
// NOTA INSTALLAZIONE: se manca, esegui: npx expo install expo-file-system
import * as FileSystem from 'expo-file-system/legacy';
import { usePremium } from '@/hooks/usePremium';
import PaywallScreen from '@/components/PaywallScreen';

// Palette PREMIUM light-dark mode — sfondo schiarito, adulto
const Colors = {
  primaryDark: '#2E6DA4',
  gradientStart: '#2E6DA4',
  gradientEnd: '#3A7FC1',
  workoutGradientTop: '#2E6DA4',
  workoutGradientMid: '#3A7FC1',
  workoutGradientBottom: '#2E6DA4',
  accentBlue: '#FFFFFF',
  healthGreen: '#4FFFB0',
  successGreen: '#059669',
  cardBg: 'rgba(255,255,255,0.15)',
  white: '#F8FAFC',
  textPrimary: '#FFFFFF',
  textSecondary: '#C8E0F4',
  gray900: '#2E6DA4',
  gray700: '#C8E0F4',
  gray200: 'rgba(255,255,255,0.18)',
  gray100: '#2E6DA4',
  navy: '#FFFFFF',
  orangeAccent: '#FFD166',
  redSoft: '#FF6B6B',
};

// Message templates - {name} = nome utente, {adj_*} = declinati per genere
// Esclamazioni generiche (Perfetto!, Ottimo!, Fantastico!) sono hardcoded e NON declinate
const MESSAGES: { [key: string]: string[] } = {
  "workout_start": [
    "{Pronto} {name}? Iniziamo con il riscaldamento camminando in modo leggermente sostenuto. Respira profondamente e partiamo!",
    "Cominciamo {name}! Ora riscaldati camminando in modo leggermente sostenuto. 3, 2, 1, partiamo!",
    "Ottimo {name}! Oggi abbiamo un bel programma insieme. Partiamo con il riscaldamento, camminando in modo leggermente sostenuto!"
  ],
  "interval_fast": [
    "Ora accelera {name}! Camminata veloce. Dai il massimo!",
    "Cambia ritmo! Adesso qualche minuto di camminata veloce o leggera corsa! tu puoi farcela!",
    "Forza {name}, alza il ritmo!",
    "Perfetto {name}, ora spingi ancora un po'!"
  ],
  "interval_moderate": [
    "Bene {name}, ora camminata a ritmo sostenuto.",
    "Perfetto {name}, mantieni un buon passo. Ritmo sostenuto.",
    "Ottimo lavoro {name}. Ora camminata sostenuta, respira bene.",
    "Continua così {name}. Cammina a ritmo sostenuto."
  ],
  "cooldown": [
    "Defaticamento. Adesso cammina normalmente {name}. Hai quasi finito il tuo allenamento per oggi.",
    "Ultimi minuti. Adesso defatica. Rallenta, e respira.",
    "Complimenti {name}! Anche oggi hai dato il massimo! Ora camminata lenta, defaticante."
  ],
  "milestone_km": [
    "Grande {name}! Hai percorso {km} {km_text}! Continua così!",
    "{km_text_cap} fatto {name}! Stai andando benissimo!",
    "{km} {km_text} completati {name}! Sei {fantastico}!"
  ],
  "milestone_2km": [
    "{Bravo} {name}! Due chilometri! Che ritmo!",
    "Secondo chilometro completato {name}! Fantastico!",
    "Due chilometri fatti {name}! Stai andando alla grande!"
  ],
  "milestone_3km": [
    "Tre chilometri {name}! Sei una macchina!",
    "Incredibile {name}! Tre chilometri percorsi!",
    "Terzo chilometro {name}! Fantastico risultato!"
  ],
  "milestone_4km": [
    "Quattro chilometri {name}! {Straordinario}!",
    "{Bravo} {name}! Quattro chilometri alle spalle!",
    "Che resistenza {name}! Quattro chilometri fatti!"
  ],
  "milestone_5km": [
    "Cinque chilometri {name}! Sei incredibile!",
    "Fantastico {name}! Cinque chilometri percorsi!",
    "Wow {name}! Cinque chilometri! Che prestazione!"
  ],
  "halfway": [
    "Ottimo lavoro {name}! Sei a metà, continua così!",
    "Metà percorso raggiunto {name}! Ce la stai facendo alla grande!",
    "Fantastico {name}, sei già a metà! Dai che ce la fai!",
    "Sei {stato} {perfetto} {name}! Metà allenamento completata!"
  ],
  "quarter_done": [
    "{Bravo} {name}! Un quarto dell'allenamento fatto!",
    "Primo quarto completato {name}! Continua così!",
    "Ottimo inizio {name}! Un quarto del percorso fatto!"
  ],
  "three_quarters": [
    "Grande {name}! Tre quarti completati! Ormai ci sei!",
    "Tre quarti fatti {name}! L'ultimo sforzo!",
    "Perfetto {name}! Manca solo un quarto!"
  ],
  "last_minute": [
    "Ultimo minuto {name}! Dai il massimo!",
    "Ultimi sessanta secondi {name}, non mollare!",
    "Un ultimo sforzo {name}, manca pochissimo!",
    "Forza {name}! Ultimo minuto, ce la fai!"
  ],
  "last_minute_cooldown": [
    "Ultimo minuto {name}. Stai facendo un ottimo lavoro, goditi questi ultimi passi.",
    "Ancora un minuto e hai finito {name}. Rilassati e respira profondamente.",
    "Siamo quasi alla fine {name}. Rallenta dolcemente, tra poco potrai riposarti."
  ],
  "last_30_seconds": [
    "Ultimi trenta secondi {name}! Quasi fatto!",
    "Trenta secondi {name}! Stringi i denti!",
    "Mancano solo trenta secondi {name}! Forza!"
  ],
  "workout_complete": [
    "Complimenti {name}! Allenamento completato! Fantastico!",
    "{Bravo} {name}! Chilometri fatti! Che soddisfazione!",
    "Missione compiuta {name}! Sei {stato} grande!",
    "Perfetto {name}! Allenamento terminato!"
  ],
  "pause": [
    "In pausa {name}. Riprendi quando sei {pronto}.",
    "Allenamento in pausa. Respira.",
    "Pausa. Prendi fiato e riparti quando vuoi."
  ],
  "resume": [
    "Ripartiamo {name}! Continua l'allenamento!",
    "Riprendiamo l'allenamento!",
    "{Bentornato} {name}, continuiamo l'allenamento!"
  ],
  "motivation_random": [
    "Stai andando benissimo {name}!",
    "Fantastico {name}, continua così!",
    "Che ritmo! Perfetto {name}!",
    "Sei forte {name}!",
    "Grande {name}! Non mollare!",
    "{Bravo} {name}! Ottima andatura!",
    "Continua {name}, stai facendo un lavoro fantastico!",
    "Perfetto {name}! Mantieni il ritmo!"
  ],
  "invalid_workout": [
    "Allenamento troppo breve. Per salvare i progressi, completa almeno l'ottanta percento del programma.",
    "L'allenamento deve durare di più per essere valido. Continua a camminare!",
    "Ancora un po'! Serve più tempo per validare l'allenamento."
  ],
  "encouragement_slow": [
    "Va bene così {name}, l'importante è muoversi! Vai al tuo ritmo!",
    "{Tranquillo} {name}, non è una gara! Continua così!",
    "Perfetto {name}, ascolta il tuo corpo! Vai bene così!"
  ],
  "encouragement_distance": [
    "Ogni passo conta {name}! Continua a camminare!",
    "{Bravo} {name}! La distanza si accumula passo dopo passo!",
    "Non importa quanto! L'importante è esserci!"
  ],
  "badge_first_workout": [
    "Complimenti {name}! Hai sbloccato il badge Primo Allenamento!",
    "Fantastico! Badge Primo Allenamento conquistato!",
    "{Bravo} {name}! Primo badge sbloccato!"
  ],
  "badge_streak_7": [
    "Incredibile {name}! Sette giorni consecutivi! Badge Settimana di Fuoco sbloccato!",
    "Fantastico! Una settimana intera {name}! Sei incredibile!",
    "Sette giorni di fila {name}! Badge Settimana di Fuoco conquistato!"
  ],
  "badge_10k_steps": [
    "Wow {name}! Diecimila passi in un allenamento! Badge sbloccato!",
    "Incredibile {name}! Diecimila passi! Sei una macchina!",
    "{Bravo} {name}! Badge Diecimila Passi conquistato!"
  ],
  "badge_5km_total": [
    "Cinque chilometri totali raggiunti {name}! Badge sbloccato!",
    "Fantastico! Cinque chilometri cumulativi {name}! Grande!",
    "{Bravo} {name}! Badge Cinque Chilometri Totali conquistato!"
  ],
  "badge_full_week": [
    "Settimana completa {name}! Tutti gli allenamenti fatti! Badge sbloccato!",
    "Perfetto! Settimana perfetta {name}! Sei {stato} {fantastico}!",
    "{Bravo} {name}! Badge Settimana Completa conquistato!"
  ],
  "badge_speed_demon": [
    "Che velocità {name}! Media sopra i sei chilometri orari! Badge Velocista sbloccato!",
    "Incredibile {name}! Sei veloce! Badge conquistato!",
    "{Bravo} {name}! Badge Velocista sbloccato! Che ritmo!"
  ],
  "badge_goal_reached": [
    "{Straordinario} {name}! Obiettivo peso raggiunto! Ce l'hai fatta!",
    "Ce l'hai fatta {name}! Peso obiettivo conquistato! Sei {stato} incredibile!",
    "Fantastico {name}! Goal Reached! Missione compiuta!"
  ],
  "badge_rain_walker": [
    "Rain Walker sbloccato! Sei {uscito} con la pioggia e hai finito. Questo dice tutto.",
    "{Bravo} {name}! Neanche la pioggia ti ferma! Badge Rain Walker!",
    "Pioggia? E tu sei qui {name}. Rain Walker sbloccato!"
  ],
  "badge_ice_walker": [
    "Badge Ice Walker! Col freddo sei ancora più forte {name}!",
    "Sotto i cinque gradi e tu cammini. Ice Walker sbloccato!",
    "{Bravo} {name}! Ice Walker! Il freddo non ti spaventa!"
  ],
  "badge_heat_warrior": [
    "Heat Warrior sbloccato! Neanche il caldo ti ha {fermato}!",
    "{Bravo} {name}! Con questo caldo sei {uscito} lo stesso. Heat Warrior!",
    "Badge Heat Warrior {name}! Bevi tanto oggi, te lo sei {meritato}."
  ],
  "badge_wind_rider": [
    "Wind Rider sbloccato! Col vento che c'era oggi, ogni passo valeva doppio.",
    "{Bravo} {name}! Il vento soffiava forte, tu di più. Wind Rider!",
    "Badge Wind Rider! Con questo vento {name}, grande rispetto."
  ],
  "badge_early_bird": [
    "Early Bird sbloccato! Il mondo dormiva, tu no.",
    "{Bravo} {name}! Prima delle sette! Early Bird!",
    "Allenamento all'alba {name}! Early Bird sbloccato!"
  ],
  "badge_night_owl": [
    "Night Owl sbloccato! Anche di notte, un passo alla volta.",
    "{Bravo} {name}! Allenamento notturno completato. Night Owl!",
    "A quest'ora il divano chiama {name}. Tu hai risposto alla strada. Night Owl!"
  ],
  "badge_all_weather": [
    "All Weather sbloccato! Sole, pioggia, freddo, caldo. Tu sempre.",
    "{Straordinario} {name}! Badge All Weather! Hai camminato con tutto!",
    "Questo badge se lo guadagnano in pochi {name}. All Weather!"
  ],
  "badge_unstoppable": [
    "Unstoppable! Dieci allenamenti con maltempo. Niente ti ferma.",
    "{Straordinario} {name}! Sei una leggenda. Unstoppable!",
    "Dieci volte col maltempo {name}. Unstoppable!"
  ],
  "badge_dawn_patrol": [
    "Dawn Patrol sbloccato! Tre allenamenti prima dell'alba.",
    "{Bravo} {name}! Tre volte all'alba! Dawn Patrol!",
    "L'alba è il tuo momento {name}. Dawn Patrol sbloccato!"
  ],
  "badge_sunset_lover": [
    "Sunset Lover sbloccato! Tre tramonti, tre allenamenti. Poesia.",
    "{Bravo} {name}! Tre volte al tramonto. Sunset Lover!",
    "Sai scegliere il momento più bello {name}. Sunset Lover!"
  ],
  "badge_lunch_hero": [
    "Lunch Break Hero! Cinque pause pranzo in allenamento. Intelligente.",
    "{Bravo} {name}! Lunch Break Hero sbloccato!",
    "La pausa pranzo più utile che ci sia {name}! Lunch Break Hero!"
  ],
  "badge_four_seasons": [
    "Four Seasons sbloccato! Hai camminato in tutte le stagioni.",
    "{Straordinario} {name}! Primavera, estate, autunno, inverno. Four Seasons!",
    "Un anno di camminate {name}. Four Seasons!"
  ],

  // ===== STREAK TRIGGERS =====
  // File: L01_streak_3_XX, L02_streak_14_XX, L03_streak_30_XX
  "streak_3": [
    "Tre giorni di fila {name}! Si sta formando un'abitudine. Continua così.",
    "{Bravo} {name}! Tre giorni consecutivi. Il corpo inizia a capire che fai sul serio.",
    "Terzo giorno di fila {name}! La costanza è più importante dell'intensità."
  ],
  "streak_14": [
    "Due settimane consecutive {name}! Quattordici giorni. Ormai è un'abitudine.",
    "{Straordinario} {name}! Due settimane di fila. La scienza dice che servono ventuno giorni per creare un'abitudine. Ci sei quasi.",
    "Quattordici giorni {name}! Il tuo corpo si è trasformato. Lo senti, vero?"
  ],
  "streak_30": [
    "Trenta giorni consecutivi {name}. Un mese intero. Sei una persona diversa da quando hai iniziato.",
    "{Straordinario} {name}! Un mese di fila! Questo non è più un programma. È il tuo stile di vita.",
    "Trenta giorni {name}. Nessuna scusa, nessun giorno saltato. Questo si chiama carattere."
  ],

  // ===== COMEBACK TRIGGERS =====
  // File: L04_comeback_short_XX, L05_comeback_long_XX
  "comeback_short": [
    "Bentornato {name}! Qualche giorno di pausa, ma sei qui. È questo che conta.",
    "{name}! Ci sei mancato. Ma l'importante è ricominciare. Ripartiamo.",
    "Eccoti {name}! Il corpo non dimentica. Riprendi il ritmo con calma."
  ],
  "comeback_long": [
    "Bentornato {name}! È passato un po' di tempo, ma il fatto che sei qui dice tutto. Ripartiamo insieme.",
    "{name}! Non importa quanto tempo è passato. Oggi è un nuovo inizio. Vai piano.",
    "Eccoti di nuovo {name}! Il corpo si readatta in fretta. Primi giorni con calma, poi torni al tuo livello."
  ],

  // ===== PERSONAL RECORD TRIGGERS =====
  // File: I01_record_distance_XX, I02_record_speed_XX, I03_record_steps_XX, I04_record_duration_XX
  "record_distance": [
    "Nuovo record di distanza {name}! Non eri mai {arrivato} così lontano in un allenamento!",
    "{Straordinario} {name}! Record personale di distanza battuto! Ogni volta un po' più in là.",
    "Record distanza! Il tuo nuovo massimo {name}! E domani lo supererai ancora."
  ],
  "record_speed": [
    "Record di velocità {name}! Non eri mai {stato} così veloce. Che ritmo!",
    "{Straordinario} {name}! La tua media più alta di sempre!",
    "Nuovo record di velocità {name}! Il corpo sta rispondendo all'allenamento."
  ],
  "record_steps": [
    "Record di passi {name}! Mai così tanti in un allenamento!",
    "{Straordinario} {name}! Il tuo massimo di passi. Le gambe ringraziano.",
    "Nuovo record passi {name}! Ogni passo è un investimento sulla tua salute."
  ],
  "record_duration": [
    "Record di durata {name}! Il tuo allenamento più lungo di sempre!",
    "{Straordinario} {name}! Non ti eri mai {allenato} così a lungo. Grande resistenza.",
    "Nuovo record di durata {name}! La tua resistenza migliora settimana dopo settimana."
  ],

  // ===== WEATHER COACHING =====
  // File: G01_weather_rain_XX, G02_weather_cold_XX, G03_weather_hot_XX, G04_weather_wind_XX
  // Nota: nessun file per sole/bel tempo — nessun coaching necessario
  "weather_rain": [
    "Piove {name}. Attenzione al terreno bagnato. Passi più corti e appoggio sicuro.",
    "Camminare sotto la pioggia {name}. In pochi lo fanno. Fai attenzione alle superfici scivolose.",
    "{name} con la pioggia il corpo lavora di più per mantenere la temperatura. Stai bruciando più calorie del solito."
  ],
  "weather_cold": [
    "{name}. Fa freddo oggi. Il corpo brucia più calorie per scaldarsi. Si chiama termogenesi. Stai facendo più di quanto pensi.",
    "{name} Con il freddo i muscoli si scaldano più lentamente. Non forzare nei primi minuti.",
    "Temperature basse oggi. {name} tieni le mani calde e respira dal naso per scaldare l'aria."
  ],
  "weather_heat": [
    "{name} Oggi fa caldo. Bevi spesso e non esagerare con l'intensità. La sicurezza prima di tutto.",
    "{name} Con il caldo il cuore lavora di più. Se senti girare la testa, fermati subito.",
    "Oggi le temperature sono alte. {name} cerca l'ombra quando puoi. E bevi prima di avere sete.",
    "Caldo importante oggi. {name} Rallenta se senti troppo calore. Non è debolezza, è intelligenza."
  ],
  "weather_wind": [
    "Oggi c'è un bel vento forte {name}. Camminare controvento aumenta il dispendio energetico. Stai lavorando di più.",
    "{name} Con questo vento ogni passo vale doppio. Abbassa leggermente il centro di gravità.",
    "{name} Il vento è il tuo avversario invisibile. Ma anche il tuo alleato per bruciare di più."
  ],

  // ===== TIME OF DAY COACHING =====
  // File: H01_time_predawn_XX, H02_time_dawn_XX, H03_time_lunch_XX, H04_time_sunset_XX, H05_time_night_XX
  "time_predawn": [
    "{name} Il mondo dorme. Tu cammini. C'è qualcosa di speciale nell'allenarsi quando è ancora buio.",
    "Prima dell'alba {name}. Pochi hanno questa disciplina. Se puoi usa un gilet riflettente.",
    "Allenamento nel silenzio. {name} A quest'ora la città è tua. Ma attenzione alla visibilità."
  ],
  "time_dawn": [
    "L'alba. Il momento più bello per camminare. {name} Goditi la luce che cambia.",
    "{name} Stai camminando all'alba. La scienza dice che l'esercizio al mattino presto favorisce l'ossidazione dei grassi.",
    "Luce dell'alba. {name} Questo è il tuo momento. Pochi sanno quanto è bello."
  ],
  "time_lunch": [
    "Allenamento in pausa pranzo. Scelta intelligente {name}. Venti minuti di camminata battono qualsiasi panino al bar.",
    "{name} Pausa pranzo attiva! Il corpo ne aveva bisogno. Torni al lavoro con più energia.",
    "Mentre gli altri scrollano il telefono, tu cammini. {name} la differenza si vede."
  ],
  "time_sunset": [
    "Allenamento al tramonto. Il momento più bello della giornata per camminare. Vero {name}?",
    "La luce del tramonto. Nel tardo pomeriggio il corpo è alla temperatura ottimale per l'esercizio. Continua così {name}.",
    "Tramonto e camminata. {name} Questa è poesia in movimento."
  ],
  "time_night": [
    "Allenamento serale. Camminare di sera abbassa il cortisolo e migliora il sonno. {name} Attenzione a renderti visibile agli altri.",
    "{name} Di sera il divano poteva vincere, ma tu hai scelto il movimento. Usa zone illuminate.",
    "Camminata notturna, {name}. Abbigliamento visibile e percorsi illuminati. La sicurezza prima di tutto."
  ],

  // ===== SPEED COACHING =====
  // File: F01_speed_fast_XX (troppo veloce), F02_speed_slow_XX (troppo lento), F03_speed_perfect_XX (giusto)
  "speed_too_slow": [
    "{name} Puoi dare qualcosina in più. Allunga il passo leggermente.",
    "{name}, il ritmo è un po' basso. Prova ad accelerare. Ce la fai.",
    "Un po' più di ritmo {name}. Non tanto, giusto un po' più veloce."
  ],
  "speed_good": [
    "Ritmo perfetto {name}! Esattamente dove devi essere. Mantieni così.",
    "{Bravo} {name}! La velocità è giusta. Sei in zona.",
    "Passo impeccabile {name}. Questo è il tuo ritmo ideale."
  ],
  "speed_fast": [
    "{name} Stai andando forte! Rallenta un po'. L'obiettivo è mantenere il ritmo, non esplodere.",
    "Piano {name}! Sei sopra il ritmo previsto. Risparmia energie per dopo.",
    "{name} Frena leggermente. A questa velocità rischi di stancarti troppo presto."
  ],

  // ===== BODY COACHING =====
  // File: E01_hydration_XX (4), E02_posture_XX (4), E03_breathing_XX (4), E04_cadence_XX (3)
  "body_hydration": [
    "Ricordati di bere {name}. Anche un piccolo sorso fa la differenza.",
    "Momento acqua {name}! L'idratazione è fondamentale per la performance.",
    "Un sorso d'acqua {name}. Il corpo lavora meglio quando è idratato.",
    "Bevi un po' {name}. Non aspettare di avere sete, a quel punto sei già disidratato."
  ],
  "body_posture": [
    "Controlla la postura {name}. Schiena dritta, spalle rilassate, sguardo avanti.",
    "{name} la postura è importante, anche in fase di allenamento. Mantieni testa alta, e mento parallelo al suolo.",
    "{name} continua a mantenere una postura corretta. Spalle giù, petto aperto. Cammini meglio e bruci di più.",
    "Raddrizza la schiena {name}. Una buona postura migliora la respirazione e riduce la fatica."
  ],
  "body_breathing": [
    "{name} Respira dal naso. Inspira per tre passi, espira per tre. Trova il tuo ritmo.",
    "{name} Attenzione al respiro. Deve essere profondo e regolare. Non trattenerlo.",
    "{name} Respira con il diaframma. La pancia si gonfia quando inspiri. Più ossigeno, più energia.",
    "{name} Se il fiato è corto, rallenta leggermente e concentrati sulla respirazione. È normale."
  ],
  "body_cadence": [
    "{name} Prova a fare passi più piccoli e frequenti. Meglio tanti passi corti che pochi lunghi.",
    "{name} La cadenza ideale è tra cento e centoventi passi al minuto. Prova a contare.",
    "{name} fai passi brevi e veloci, così riduci l'impatto sulle articolazioni e migliori l'efficienza."
  ],

  // ===== SCIENCE PILLS =====
  // File: N01_science_cal_XX, N02_science_heart_XX, N03_science_metab_XX,
  //       N04_science_sleep_XX, N05_science_mood_XX, N06_science_posture_XX
  // Rotazione ciclica: ogni 12 min, indice 0-5
  "science_cal": [
    "Lo sapevi {name}? Camminando a passo svelto bruci circa cinque calorie al minuto. In trenta minuti, centocinquanta calorie. Come un cornetto al bar.",
    "{name} Adesso una curiosità. Dopo quaranta minuti di camminata il corpo inizia a bruciare prevalentemente grassi anziché zuccheri. Ecco perché la durata conta.",
    "{name} Sai perché camminare funziona così bene? Perché il corpo non lo percepisce come stress. Non alza il cortisolo. Bruci grasso senza che il corpo si difenda."
  ],
  "science_heart": [
    "Il tuo cuore sta facendo un lavoro eccellente. La camminata regolare riduce il rischio cardiovascolare del trenta percento. Continua così {name}.",
    "{name} Ogni passo rinforza il cuore. Trenta minuti al giorno possono abbassare la pressione arteriosa come un farmaco. Senza effetti collaterali.",
    "{name} sapevi che il cuore di chi cammina regolarmente batte più lentamente a riposo? Significa che lavora meno e dura di più."
  ],
  "science_metab": [
    "{name}, una curiosità! Dopo l'allenamento il metabolismo resta elevato per ore. Si chiama effetto afterburn. Bruci calorie anche sul divano.",
    "{name} sapevi che la camminata aumenta la massa muscolare delle gambe? Più muscoli significa metabolismo basale più alto. Bruci di più anche dormendo.",
    "Il metabolismo non è fisso. Si allena come un muscolo. Più cammini, più il corpo diventa efficiente nel bruciare grassi. Ricordalo {name}."
  ],
  "science_sleep": [
    "Chi cammina almeno trenta minuti al giorno dorme in media quarantacinque minuti in più a notte. Quindi, per un sano riposo, {name} continua a camminare.",
    "{name} un altro beneficio della camminata. La camminata regola il ritmo circadiano. Tradotto: dormi meglio, ti svegli meglio, hai più energia.",
    "Stasera dormirai bene {name}. L'esercizio fisico è il miglior ed il più naturale sonnifero che esista."
  ],
  "science_mood": [
    "{name} In questo momento il tuo cervello sta producendo endorfine. È per questo che dopo l'allenamento ti senti bene. Non è psicologia, è chimica.",
    "Lo sapevi {name}? Venti minuti di camminata hanno lo stesso effetto di un ansiolitico a basso dosaggio. Senza ricetta medica.",
    "{name} Stai facendo la cosa migliore per il tuo umore. La camminata riduce ansia e depressione più di qualsiasi integratore."
  ],
  "science_body": [
    "{name} Camminare è il miglior esercizio per la schiena. Rinforza i muscoli paravertebrali senza caricare i dischi.",
    "Lo sapevi {name}? Chi cammina regolarmente ha il cinquanta percento in meno di mal di schiena. I fisioterapisti lo prescrivono.",
    "{name} La postura migliora camminando. Il corpo impara l'allineamento giusto passo dopo passo."
  ],

  // ===== UPHILL DETECTION =====
  // File: O02_motivation_uphill_XX
  "uphill": [
    "Salita {name}? Perfetto. In salita bruci il quaranta percento in più. Ogni metro guadagnato conta doppio.",
    "La salita è il tuo alleato {name}. Passi più corti, appoggio su tutta la pianta del piede.",
    "Su per la salita {name}! Le gambe bruciano? Bene. Vuol dire che stai costruendo muscolo."
  ],
};

// Aggettivi declinati per genere — SOLO quelli riferiti direttamente all'utente
const ADJECTIVES: { [gender: string]: { [key: string]: string } } = {
  "M": {
    "Bravo": "Bravo", "bravo": "bravo",
    "Pronto": "Pronto", "pronto": "pronto",
    "Tranquillo": "Tranquillo", "tranquillo": "tranquillo",
    "Bentornato": "Bentornato", "bentornato": "bentornato",
    "Straordinario": "Straordinario", "straordinario": "straordinario",
    "fantastico": "fantastico", "Fantastico": "Fantastico",
    "perfetto": "perfetto", "Perfetto": "Perfetto",
    "stato": "stato",
  },
  "F": {
    "Bravo": "Brava", "bravo": "brava",
    "Pronto": "Pronta", "pronto": "pronta",
    "Tranquillo": "Tranquilla", "tranquillo": "tranquilla",
    "Bentornato": "Bentornata", "bentornato": "bentornata",
    "Straordinario": "Straordinaria", "straordinario": "straordinaria",
    "fantastico": "fantastica", "Fantastico": "Fantastica",
    "perfetto": "perfetta", "Perfetto": "Perfetta",
    "stato": "stata",
  }
};


// ElevenLabs audio: voce_genere/ (es. female_m = voce donna, testi maschili)
const AUDIO_FILES: { [voice: string]: { [key: string]: any } } = {
  female_m: {
    workout_start_1_seg1: require('../../assets/audio/female_m/D01_warmup_start_01_TAMMY_M_seg1.mp3'),
    workout_start_1_seg2: require('../../assets/audio/female_m/D01_warmup_start_01_TAMMY_M_seg2.mp3'),
    workout_start_2_seg1: require('../../assets/audio/female_m/D01_warmup_start_02_TAMMY_M_seg1.mp3'),
    workout_start_2_seg2: require('../../assets/audio/female_m/D01_warmup_start_02_TAMMY_M_seg2.mp3'),
    workout_start_3_seg1: require('../../assets/audio/female_m/D01_warmup_start_03_TAMMY_M_seg1.mp3'),
    workout_start_3_seg2: require('../../assets/audio/female_m/D01_warmup_start_03_TAMMY_M_seg2.mp3'),
    interval_moderate_1_seg1: require('../../assets/audio/female_m/D03_phase_moderate_01_TAMMY_M_seg1.mp3'),
    interval_moderate_1_seg2: require('../../assets/audio/female_m/D03_phase_moderate_01_TAMMY_M_seg2.mp3'),
    interval_moderate_2_seg1: require('../../assets/audio/female_m/D03_phase_moderate_02_TAMMY_M_seg1.mp3'),
    interval_moderate_2_seg2: require('../../assets/audio/female_m/D03_phase_moderate_02_TAMMY_M_seg2.mp3'),
    interval_moderate_3_seg1: require('../../assets/audio/female_m/D03_phase_moderate_03_TAMMY_M_seg1.mp3'),
    interval_fast_1_seg1: require('../../assets/audio/female_m/D04_phase_sustained_01_TAMMY_M_seg1.mp3'),
    interval_fast_1_seg2: require('../../assets/audio/female_m/D04_phase_sustained_01_TAMMY_M_seg2.mp3'),
    interval_fast_2_seg1: require('../../assets/audio/female_m/D04_phase_sustained_02_TAMMY_M_seg1.mp3'),
    interval_fast_2_seg2: require('../../assets/audio/female_m/D04_phase_sustained_02_TAMMY_M_seg2.mp3'),
    interval_fast_3_seg1: require('../../assets/audio/female_m/D04_phase_sustained_03_TAMMY_M_seg1.mp3'),
    interval_fast_3_seg2: require('../../assets/audio/female_m/D04_phase_sustained_03_TAMMY_M_seg2.mp3'),
    interval_fast_4_seg1: require('../../assets/audio/female_m/D04_phase_sustained_04_TAMMY_M_seg1.mp3'),
    interval_fast_4_seg2: require('../../assets/audio/female_m/D04_phase_sustained_04_TAMMY_M_seg2.mp3'),
    cooldown_1_seg1: require('../../assets/audio/female_m/D05_phase_recovery_01_TAMMY_M_seg1.mp3'),
    cooldown_1_seg2: require('../../assets/audio/female_m/D05_phase_recovery_01_TAMMY_M_seg2.mp3'),
    cooldown_2_seg1: require('../../assets/audio/female_m/D05_phase_recovery_02_TAMMY_M_seg1.mp3'),
    cooldown_2_seg2: require('../../assets/audio/female_m/D05_phase_recovery_02_TAMMY_M_seg2.mp3'),
    cooldown_3_seg1: require('../../assets/audio/female_m/D05_phase_recovery_03_TAMMY_M_seg1.mp3'),
    cooldown_3_seg2: require('../../assets/audio/female_m/D05_phase_recovery_03_TAMMY_M_seg2.mp3'),
    motivation_random_1_seg1: require('../../assets/audio/female_m/O01_motivation_push_01_TAMMY_M_seg1.mp3'),
    motivation_random_1_seg2: require('../../assets/audio/female_m/O01_motivation_push_01_TAMMY_M_seg2.mp3'),
    motivation_random_2: require('../../assets/audio/female_m/O01_motivation_push_02_TAMMY_M.mp3'),
    motivation_random_3: require('../../assets/audio/female_m/O01_motivation_push_03_TAMMY_M.mp3'),
    motivation_random_4_seg1: require('../../assets/audio/female_m/O01_motivation_push_04_TAMMY_M_seg1.mp3'),
    motivation_random_4_seg2: require('../../assets/audio/female_m/O01_motivation_push_04_TAMMY_M_seg2.mp3'),
    last_minute_1: require('../../assets/audio/female_m/O03_final_push_01_TAMMY_M.mp3'),
    last_minute_2: require('../../assets/audio/female_m/O03_final_push_02_TAMMY_M.mp3'),
    last_minute_3: require('../../assets/audio/female_m/O03_final_push_03_TAMMY_M.mp3'),
    last_minute_4: require('../../assets/audio/female_m/O03_final_push_04_TAMMY_M.mp3'),
    last_30_seconds_1: require('../../assets/audio/female_m/O03_final_push_05_TAMMY_M.mp3'),
    last_30_seconds_2: require('../../assets/audio/female_m/O03_final_push_06_TAMMY_M.mp3'),
    last_30_seconds_3: require('../../assets/audio/female_m/O03_final_push_07_TAMMY_M.mp3'),
    badge_rain_walker_1: require('../../assets/audio/female_m/C01_rain_walker_01_TAMMY_M.mp3'),
    badge_rain_walker_2_seg1: require('../../assets/audio/female_m/C01_rain_walker_02_TAMMY_M_seg1.mp3'),
    badge_rain_walker_2_seg2: require('../../assets/audio/female_m/C01_rain_walker_02_TAMMY_M_seg2.mp3'),
    badge_rain_walker_3_seg1: require('../../assets/audio/female_m/C01_rain_walker_03_TAMMY_M_seg1.mp3'),
    badge_rain_walker_3_seg2: require('../../assets/audio/female_m/C01_rain_walker_03_TAMMY_M_seg2.mp3'),
    badge_ice_walker_1_seg1: require('../../assets/audio/female_m/C02_ice_walker_01_TAMMY_M_seg1.mp3'),
    badge_ice_walker_2: require('../../assets/audio/female_m/C02_ice_walker_02_TAMMY_M.mp3'),
    badge_ice_walker_3_seg1: require('../../assets/audio/female_m/C02_ice_walker_03_TAMMY_M_seg1.mp3'),
    badge_ice_walker_3_seg2: require('../../assets/audio/female_m/C02_ice_walker_03_TAMMY_M_seg2.mp3'),
    badge_heat_warrior_1: require('../../assets/audio/female_m/C03_heat_warrior_01_TAMMY_M.mp3'),
    badge_heat_warrior_2_seg1: require('../../assets/audio/female_m/C03_heat_warrior_02_TAMMY_M_seg1.mp3'),
    badge_heat_warrior_2_seg2: require('../../assets/audio/female_m/C03_heat_warrior_02_TAMMY_M_seg2.mp3'),
    badge_heat_warrior_3_seg1: require('../../assets/audio/female_m/C03_heat_warrior_03_TAMMY_M_seg1.mp3'),
    badge_heat_warrior_3_seg2: require('../../assets/audio/female_m/C03_heat_warrior_03_TAMMY_M_seg2.mp3'),
    badge_wind_rider_1: require('../../assets/audio/female_m/C04_wind_rider_01_TAMMY_M.mp3'),
    badge_wind_rider_2_seg1: require('../../assets/audio/female_m/C04_wind_rider_02_TAMMY_M_seg1.mp3'),
    badge_wind_rider_2_seg2: require('../../assets/audio/female_m/C04_wind_rider_02_TAMMY_M_seg2.mp3'),
    badge_wind_rider_3_seg1: require('../../assets/audio/female_m/C04_wind_rider_03_TAMMY_M_seg1.mp3'),
    badge_wind_rider_3_seg2: require('../../assets/audio/female_m/C04_wind_rider_03_TAMMY_M_seg2.mp3'),
    badge_early_bird_1: require('../../assets/audio/female_m/C05_early_bird_01_TAMMY_M.mp3'),
    badge_early_bird_2_seg1: require('../../assets/audio/female_m/C05_early_bird_02_TAMMY_M_seg1.mp3'),
    badge_early_bird_2_seg2: require('../../assets/audio/female_m/C05_early_bird_02_TAMMY_M_seg2.mp3'),
    badge_early_bird_3_seg1: require('../../assets/audio/female_m/C05_early_bird_03_TAMMY_M_seg1.mp3'),
    badge_early_bird_3_seg2: require('../../assets/audio/female_m/C05_early_bird_03_TAMMY_M_seg2.mp3'),
    badge_night_owl_1: require('../../assets/audio/female_m/C06_night_owl_01_TAMMY_M.mp3'),
    badge_night_owl_2_seg1: require('../../assets/audio/female_m/C06_night_owl_02_TAMMY_M_seg1.mp3'),
    badge_night_owl_2_seg2: require('../../assets/audio/female_m/C06_night_owl_02_TAMMY_M_seg2.mp3'),
    badge_night_owl_3: require('../../assets/audio/female_m/C06_night_owl_03_TAMMY_M.mp3'),
    badge_all_weather_1: require('../../assets/audio/female_m/C07_all_weather_01_TAMMY_M.mp3'),
    badge_all_weather_2_seg1: require('../../assets/audio/female_m/C07_all_weather_02_TAMMY_M_seg1.mp3'),
    badge_all_weather_2_seg2: require('../../assets/audio/female_m/C07_all_weather_02_TAMMY_M_seg2.mp3'),
    badge_all_weather_3_seg1: require('../../assets/audio/female_m/C07_all_weather_03_TAMMY_M_seg1.mp3'),
    badge_all_weather_3_seg2: require('../../assets/audio/female_m/C07_all_weather_03_TAMMY_M_seg2.mp3'),
    badge_unstoppable_1: require('../../assets/audio/female_m/C08_unstoppable_01_TAMMY_M.mp3'),
    badge_unstoppable_2_seg1: require('../../assets/audio/female_m/C08_unstoppable_02_TAMMY_M_seg1.mp3'),
    badge_unstoppable_2_seg2: require('../../assets/audio/female_m/C08_unstoppable_02_TAMMY_M_seg2.mp3'),
    badge_unstoppable_3_seg1: require('../../assets/audio/female_m/C08_unstoppable_03_TAMMY_M_seg1.mp3'),
    badge_unstoppable_3_seg2: require('../../assets/audio/female_m/C08_unstoppable_03_TAMMY_M_seg2.mp3'),
    badge_dawn_patrol_1: require('../../assets/audio/female_m/C09_dawn_patrol_01_TAMMY_M.mp3'),
    badge_dawn_patrol_2_seg1: require('../../assets/audio/female_m/C09_dawn_patrol_02_TAMMY_M_seg1.mp3'),
    badge_dawn_patrol_2_seg2: require('../../assets/audio/female_m/C09_dawn_patrol_02_TAMMY_M_seg2.mp3'),
    badge_dawn_patrol_3_seg1: require('../../assets/audio/female_m/C09_dawn_patrol_03_TAMMY_M_seg1.mp3'),
    badge_dawn_patrol_3_seg2: require('../../assets/audio/female_m/C09_dawn_patrol_03_TAMMY_M_seg2.mp3'),
    badge_sunset_lover_1: require('../../assets/audio/female_m/C10_sunset_lover_01_TAMMY_M.mp3'),
    badge_sunset_lover_2_seg1: require('../../assets/audio/female_m/C10_sunset_lover_02_TAMMY_M_seg1.mp3'),
    badge_sunset_lover_2_seg2: require('../../assets/audio/female_m/C10_sunset_lover_02_TAMMY_M_seg2.mp3'),
    badge_sunset_lover_3_seg1: require('../../assets/audio/female_m/C10_sunset_lover_03_TAMMY_M_seg1.mp3'),
    badge_sunset_lover_3_seg2: require('../../assets/audio/female_m/C10_sunset_lover_03_TAMMY_M_seg2.mp3'),
    badge_lunch_hero_1: require('../../assets/audio/female_m/C11_lunch_hero_01_TAMMY_M.mp3'),
    badge_lunch_hero_2_seg1: require('../../assets/audio/female_m/C11_lunch_hero_02_TAMMY_M_seg1.mp3'),
    badge_lunch_hero_2_seg2: require('../../assets/audio/female_m/C11_lunch_hero_02_TAMMY_M_seg2.mp3'),
    badge_lunch_hero_3_seg1: require('../../assets/audio/female_m/C11_lunch_hero_03_TAMMY_M_seg1.mp3'),
    badge_lunch_hero_3_seg2: require('../../assets/audio/female_m/C11_lunch_hero_03_TAMMY_M_seg2.mp3'),
    badge_four_seasons_1: require('../../assets/audio/female_m/C12_four_seasons_01_TAMMY_M.mp3'),
    badge_four_seasons_2_seg1: require('../../assets/audio/female_m/C12_four_seasons_02_TAMMY_M_seg1.mp3'),
    badge_four_seasons_2_seg2: require('../../assets/audio/female_m/C12_four_seasons_02_TAMMY_M_seg2.mp3'),
    badge_four_seasons_3_seg1: require('../../assets/audio/female_m/C12_four_seasons_03_TAMMY_M_seg1.mp3'),
    badge_four_seasons_3_seg2: require('../../assets/audio/female_m/C12_four_seasons_03_TAMMY_M_seg2.mp3'),
    body_hydration_1_seg1: require('../../assets/audio/female_m/E01_hydration_01_TAMMY_M_seg1.mp3'),
    body_hydration_1_seg2: require('../../assets/audio/female_m/E01_hydration_01_TAMMY_M_seg2.mp3'),
    body_hydration_2_seg1: require('../../assets/audio/female_m/E01_hydration_02_TAMMY_M_seg1.mp3'),
    body_hydration_2_seg2: require('../../assets/audio/female_m/E01_hydration_02_TAMMY_M_seg2.mp3'),
    body_hydration_3_seg1: require('../../assets/audio/female_m/E01_hydration_03_TAMMY_M_seg1.mp3'),
    body_hydration_3_seg2: require('../../assets/audio/female_m/E01_hydration_03_TAMMY_M_seg2.mp3'),
    body_hydration_4_seg1: require('../../assets/audio/female_m/E01_hydration_04_TAMMY_M_seg1.mp3'),
    body_hydration_4_seg2: require('../../assets/audio/female_m/E01_hydration_04_TAMMY_M_seg2.mp3'),
    body_posture_1_seg1: require('../../assets/audio/female_m/E02_posture_01_TAMMY_M_seg1.mp3'),
    body_posture_1_seg2: require('../../assets/audio/female_m/E02_posture_01_TAMMY_M_seg2.mp3'),
    body_posture_2: require('../../assets/audio/female_m/E02_posture_02_TAMMY_M.mp3'),
    body_posture_3: require('../../assets/audio/female_m/E02_posture_03_TAMMY_M.mp3'),
    body_posture_4_seg1: require('../../assets/audio/female_m/E02_posture_04_TAMMY_M_seg1.mp3'),
    body_posture_4_seg2: require('../../assets/audio/female_m/E02_posture_04_TAMMY_M_seg2.mp3'),
    body_breathing_1: require('../../assets/audio/female_m/E03_breathing_01_TAMMY_M.mp3'),
    body_breathing_2: require('../../assets/audio/female_m/E03_breathing_02_TAMMY_M.mp3'),
    body_breathing_3: require('../../assets/audio/female_m/E03_breathing_03_TAMMY_M.mp3'),
    body_breathing_4: require('../../assets/audio/female_m/E03_breathing_04_TAMMY_M.mp3'),
    body_cadence_1: require('../../assets/audio/female_m/E04_cadence_01_TAMMY_M.mp3'),
    body_cadence_2: require('../../assets/audio/female_m/E04_cadence_02_TAMMY_M.mp3'),
    body_cadence_3: require('../../assets/audio/female_m/E04_cadence_03_TAMMY_M.mp3'),
    speed_fast_1: require('../../assets/audio/female_m/F01_speed_fast_01_TAMMY_M.mp3'),
    speed_fast_2_seg1: require('../../assets/audio/female_m/F01_speed_fast_02_TAMMY_M_seg1.mp3'),
    speed_fast_2_seg2: require('../../assets/audio/female_m/F01_speed_fast_02_TAMMY_M_seg2.mp3'),
    speed_fast_3: require('../../assets/audio/female_m/F01_speed_fast_03_TAMMY_M.mp3'),
    speed_too_slow_1: require('../../assets/audio/female_m/F02_speed_slow_01_TAMMY_M.mp3'),
    speed_too_slow_2: require('../../assets/audio/female_m/F02_speed_slow_02_TAMMY_M.mp3'),
    speed_too_slow_3_seg1: require('../../assets/audio/female_m/F02_speed_slow_03_TAMMY_M_seg1.mp3'),
    speed_too_slow_3_seg2: require('../../assets/audio/female_m/F02_speed_slow_03_TAMMY_M_seg2.mp3'),
    speed_good_1_seg1: require('../../assets/audio/female_m/F03_speed_perfect_01_TAMMY_M_seg1.mp3'),
    speed_good_1_seg2: require('../../assets/audio/female_m/F03_speed_perfect_01_TAMMY_M_seg2.mp3'),
    speed_good_2_seg1: require('../../assets/audio/female_m/F03_speed_perfect_02_TAMMY_M_seg1.mp3'),
    speed_good_2_seg2: require('../../assets/audio/female_m/F03_speed_perfect_02_TAMMY_M_seg2.mp3'),
    speed_good_3_seg1: require('../../assets/audio/female_m/F03_speed_perfect_03_TAMMY_M_seg1.mp3'),
    speed_good_3_seg2: require('../../assets/audio/female_m/F03_speed_perfect_03_TAMMY_M_seg2.mp3'),
    weather_rain_1_seg1: require('../../assets/audio/female_m/G01_weather_rain_01_TAMMY_M_seg1.mp3'),
    weather_rain_1_seg2: require('../../assets/audio/female_m/G01_weather_rain_01_TAMMY_M_seg2.mp3'),
    weather_rain_2_seg1: require('../../assets/audio/female_m/G01_weather_rain_02_TAMMY_M_seg1.mp3'),
    weather_rain_2_seg2: require('../../assets/audio/female_m/G01_weather_rain_02_TAMMY_M_seg2.mp3'),
    weather_rain_3: require('../../assets/audio/female_m/G01_weather_rain_03_TAMMY_M.mp3'),
    weather_cold_1: require('../../assets/audio/female_m/G02_weather_cold_01_TAMMY_M.mp3'),
    weather_cold_2: require('../../assets/audio/female_m/G02_weather_cold_02_TAMMY_M.mp3'),
    weather_cold_3_seg1: require('../../assets/audio/female_m/G02_weather_cold_03_TAMMY_M_seg1.mp3'),
    weather_cold_3_seg2: require('../../assets/audio/female_m/G02_weather_cold_03_TAMMY_M_seg2.mp3'),
    weather_heat_1: require('../../assets/audio/female_m/G03_weather_hot_01_TAMMY_M.mp3'),
    weather_heat_2: require('../../assets/audio/female_m/G03_weather_hot_02_TAMMY_M.mp3'),
    weather_heat_3_seg1: require('../../assets/audio/female_m/G03_weather_hot_03_TAMMY_M_seg1.mp3'),
    weather_heat_3_seg2: require('../../assets/audio/female_m/G03_weather_hot_03_TAMMY_M_seg2.mp3'),
    weather_heat_4_seg1: require('../../assets/audio/female_m/G03_weather_hot_04_TAMMY_M_seg1.mp3'),
    weather_heat_4_seg2: require('../../assets/audio/female_m/G03_weather_hot_04_TAMMY_M_seg2.mp3'),
    weather_wind_1_seg1: require('../../assets/audio/female_m/G04_weather_wind_01_TAMMY_M_seg1.mp3'),
    weather_wind_1_seg2: require('../../assets/audio/female_m/G04_weather_wind_01_TAMMY_M_seg2.mp3'),
    weather_wind_2: require('../../assets/audio/female_m/G04_weather_wind_02_TAMMY_M.mp3'),
    weather_wind_3: require('../../assets/audio/female_m/G04_weather_wind_03_TAMMY_M.mp3'),
    time_predawn_1: require('../../assets/audio/female_m/H01_time_predawn_01_TAMMY_M.mp3'),
    time_predawn_2_seg1: require('../../assets/audio/female_m/H01_time_predawn_02_TAMMY_M_seg1.mp3'),
    time_predawn_2_seg2: require('../../assets/audio/female_m/H01_time_predawn_02_TAMMY_M_seg2.mp3'),
    time_predawn_3_seg1: require('../../assets/audio/female_m/H01_time_predawn_03_TAMMY_M_seg1.mp3'),
    time_predawn_3_seg2: require('../../assets/audio/female_m/H01_time_predawn_03_TAMMY_M_seg2.mp3'),
    time_dawn_1_seg1: require('../../assets/audio/female_m/H02_time_dawn_01_TAMMY_M_seg1.mp3'),
    time_dawn_1_seg2: require('../../assets/audio/female_m/H02_time_dawn_01_TAMMY_M_seg2.mp3'),
    time_dawn_2: require('../../assets/audio/female_m/H02_time_dawn_02_TAMMY_M.mp3'),
    time_dawn_3_seg1: require('../../assets/audio/female_m/H02_time_dawn_03_TAMMY_M_seg1.mp3'),
    time_dawn_3_seg2: require('../../assets/audio/female_m/H02_time_dawn_03_TAMMY_M_seg2.mp3'),
    time_lunch_1_seg1: require('../../assets/audio/female_m/H03_time_lunch_01_TAMMY_M_seg1.mp3'),
    time_lunch_1_seg2: require('../../assets/audio/female_m/H03_time_lunch_01_TAMMY_M_seg2.mp3'),
    time_lunch_2: require('../../assets/audio/female_m/H03_time_lunch_02_TAMMY_M.mp3'),
    time_lunch_3_seg1: require('../../assets/audio/female_m/H03_time_lunch_03_TAMMY_M_seg1.mp3'),
    time_lunch_3_seg2: require('../../assets/audio/female_m/H03_time_lunch_03_TAMMY_M_seg2.mp3'),
    time_sunset_1_seg1: require('../../assets/audio/female_m/H04_time_sunset_01_TAMMY_M_seg1.mp3'),
    time_sunset_2_seg1: require('../../assets/audio/female_m/H04_time_sunset_02_TAMMY_M_seg1.mp3'),
    time_sunset_3_seg1: require('../../assets/audio/female_m/H04_time_sunset_03_TAMMY_M_seg1.mp3'),
    time_sunset_3_seg2: require('../../assets/audio/female_m/H04_time_sunset_03_TAMMY_M_seg2.mp3'),
    time_night_1_seg1: require('../../assets/audio/female_m/H05_time_night_01_TAMMY_M_seg1.mp3'),
    time_night_1_seg2: require('../../assets/audio/female_m/H05_time_night_01_TAMMY_M_seg2.mp3'),
    time_night_2: require('../../assets/audio/female_m/H05_time_night_02_TAMMY_M.mp3'),
    time_night_3_seg1: require('../../assets/audio/female_m/H05_time_night_03_TAMMY_M_seg1.mp3'),
    time_night_3_seg2: require('../../assets/audio/female_m/H05_time_night_03_TAMMY_M_seg2.mp3'),
    record_distance_1_seg1: require('../../assets/audio/female_m/I01_record_distance_01_TAMMY_M_seg1.mp3'),
    record_distance_1_seg2: require('../../assets/audio/female_m/I01_record_distance_01_TAMMY_M_seg2.mp3'),
    record_distance_2_seg1: require('../../assets/audio/female_m/I01_record_distance_02_TAMMY_M_seg1.mp3'),
    record_distance_2_seg2: require('../../assets/audio/female_m/I01_record_distance_02_TAMMY_M_seg2.mp3'),
    record_distance_3_seg1: require('../../assets/audio/female_m/I01_record_distance_03_TAMMY_M_seg1.mp3'),
    record_distance_3_seg2: require('../../assets/audio/female_m/I01_record_distance_03_TAMMY_M_seg2.mp3'),
    record_speed_1_seg1: require('../../assets/audio/female_m/I02_record_speed_01_TAMMY_M_seg1.mp3'),
    record_speed_1_seg2: require('../../assets/audio/female_m/I02_record_speed_01_TAMMY_M_seg2.mp3'),
    record_speed_2_seg1: require('../../assets/audio/female_m/I02_record_speed_02_TAMMY_M_seg1.mp3'),
    record_speed_2_seg2: require('../../assets/audio/female_m/I02_record_speed_02_TAMMY_M_seg2.mp3'),
    record_speed_3_seg1: require('../../assets/audio/female_m/I02_record_speed_03_TAMMY_M_seg1.mp3'),
    record_speed_3_seg2: require('../../assets/audio/female_m/I02_record_speed_03_TAMMY_M_seg2.mp3'),
    record_steps_1_seg1: require('../../assets/audio/female_m/I03_record_steps_01_TAMMY_M_seg1.mp3'),
    record_steps_1_seg2: require('../../assets/audio/female_m/I03_record_steps_01_TAMMY_M_seg2.mp3'),
    record_steps_2_seg1: require('../../assets/audio/female_m/I03_record_steps_02_TAMMY_M_seg1.mp3'),
    record_steps_2_seg2: require('../../assets/audio/female_m/I03_record_steps_02_TAMMY_M_seg2.mp3'),
    record_steps_3_seg1: require('../../assets/audio/female_m/I03_record_steps_03_TAMMY_M_seg1.mp3'),
    record_steps_3_seg2: require('../../assets/audio/female_m/I03_record_steps_03_TAMMY_M_seg2.mp3'),
    record_duration_1_seg1: require('../../assets/audio/female_m/I04_record_duration_01_TAMMY_M_seg1.mp3'),
    record_duration_1_seg2: require('../../assets/audio/female_m/I04_record_duration_01_TAMMY_M_seg2.mp3'),
    record_duration_2_seg1: require('../../assets/audio/female_m/I04_record_duration_02_TAMMY_M_seg1.mp3'),
    record_duration_2_seg2: require('../../assets/audio/female_m/I04_record_duration_02_TAMMY_M_seg2.mp3'),
    record_duration_3_seg1: require('../../assets/audio/female_m/I04_record_duration_03_TAMMY_M_seg1.mp3'),
    record_duration_3_seg2: require('../../assets/audio/female_m/I04_record_duration_03_TAMMY_M_seg2.mp3'),
    streak_3_1_seg1: require('../../assets/audio/female_m/L01_streak_3_01_TAMMY_M_seg1.mp3'),
    streak_3_1_seg2: require('../../assets/audio/female_m/L01_streak_3_01_TAMMY_M_seg2.mp3'),
    streak_3_2_seg1: require('../../assets/audio/female_m/L01_streak_3_02_TAMMY_M_seg1.mp3'),
    streak_3_2_seg2: require('../../assets/audio/female_m/L01_streak_3_02_TAMMY_M_seg2.mp3'),
    streak_3_3_seg1: require('../../assets/audio/female_m/L01_streak_3_03_TAMMY_M_seg1.mp3'),
    streak_3_3_seg2: require('../../assets/audio/female_m/L01_streak_3_03_TAMMY_M_seg2.mp3'),
    streak_14_1_seg1: require('../../assets/audio/female_m/L02_streak_14_01_TAMMY_M_seg1.mp3'),
    streak_14_1_seg2: require('../../assets/audio/female_m/L02_streak_14_01_TAMMY_M_seg2.mp3'),
    streak_14_2_seg1: require('../../assets/audio/female_m/L02_streak_14_02_TAMMY_M_seg1.mp3'),
    streak_14_2_seg2: require('../../assets/audio/female_m/L02_streak_14_02_TAMMY_M_seg2.mp3'),
    streak_14_3_seg1: require('../../assets/audio/female_m/L02_streak_14_03_TAMMY_M_seg1.mp3'),
    streak_14_3_seg2: require('../../assets/audio/female_m/L02_streak_14_03_TAMMY_M_seg2.mp3'),
    streak_30_1_seg1: require('../../assets/audio/female_m/L03_streak_30_01_TAMMY_M_seg1.mp3'),
    streak_30_1_seg2: require('../../assets/audio/female_m/L03_streak_30_01_TAMMY_M_seg2.mp3'),
    streak_30_2_seg1: require('../../assets/audio/female_m/L03_streak_30_02_TAMMY_M_seg1.mp3'),
    streak_30_2_seg2: require('../../assets/audio/female_m/L03_streak_30_02_TAMMY_M_seg2.mp3'),
    streak_30_3_seg1: require('../../assets/audio/female_m/L03_streak_30_03_TAMMY_M_seg1.mp3'),
    streak_30_3_seg2: require('../../assets/audio/female_m/L03_streak_30_03_TAMMY_M_seg2.mp3'),
    comeback_short_1_seg1: require('../../assets/audio/female_m/L04_comeback_short_01_TAMMY_M_seg1.mp3'),
    comeback_short_1_seg2: require('../../assets/audio/female_m/L04_comeback_short_01_TAMMY_M_seg2.mp3'),
    comeback_short_2: require('../../assets/audio/female_m/L04_comeback_short_02_TAMMY_M.mp3'),
    comeback_short_3_seg1: require('../../assets/audio/female_m/L04_comeback_short_03_TAMMY_M_seg1.mp3'),
    comeback_short_3_seg2: require('../../assets/audio/female_m/L04_comeback_short_03_TAMMY_M_seg2.mp3'),
    comeback_long_1_seg1: require('../../assets/audio/female_m/L05_comeback_long_01_TAMMY_M_seg1.mp3'),
    comeback_long_1_seg2: require('../../assets/audio/female_m/L05_comeback_long_01_TAMMY_M_seg2.mp3'),
    comeback_long_2: require('../../assets/audio/female_m/L05_comeback_long_02_TAMMY_M.mp3'),
    comeback_long_3_seg1: require('../../assets/audio/female_m/L05_comeback_long_03_TAMMY_M_seg1.mp3'),
    comeback_long_3_seg2: require('../../assets/audio/female_m/L05_comeback_long_03_TAMMY_M_seg2.mp3'),
    science_cal_1_seg1: require('../../assets/audio/female_m/N01_science_cal_01_TAMMY_M_seg1.mp3'),
    science_cal_1_seg2: require('../../assets/audio/female_m/N01_science_cal_01_TAMMY_M_seg2.mp3'),
    science_cal_2: require('../../assets/audio/female_m/N01_science_cal_02_TAMMY_M.mp3'),
    science_cal_3: require('../../assets/audio/female_m/N01_science_cal_03_TAMMY_M.mp3'),
    science_heart_1_seg1: require('../../assets/audio/female_m/N02_science_heart_01_TAMMY_M_seg1.mp3'),
    science_heart_2: require('../../assets/audio/female_m/N02_science_heart_02_TAMMY_M.mp3'),
    science_heart_3: require('../../assets/audio/female_m/N02_science_heart_03_TAMMY_M.mp3'),
    science_metab_1: require('../../assets/audio/female_m/N03_science_metab_01_TAMMY_M.mp3'),
    science_metab_2: require('../../assets/audio/female_m/N03_science_metab_02_TAMMY_M.mp3'),
    science_metab_3_seg1: require('../../assets/audio/female_m/N03_science_metab_03_TAMMY_M_seg1.mp3'),
    science_sleep_1_seg1: require('../../assets/audio/female_m/N04_science_sleep_01_TAMMY_M_seg1.mp3'),
    science_sleep_1_seg2: require('../../assets/audio/female_m/N04_science_sleep_01_TAMMY_M_seg2.mp3'),
    science_sleep_2: require('../../assets/audio/female_m/N04_science_sleep_02_TAMMY_M.mp3'),
    science_sleep_3_seg1: require('../../assets/audio/female_m/N04_science_sleep_03_TAMMY_M_seg1.mp3'),
    science_sleep_3_seg2: require('../../assets/audio/female_m/N04_science_sleep_03_TAMMY_M_seg2.mp3'),
    science_mood_1: require('../../assets/audio/female_m/N05_science_mood_01_TAMMY_M.mp3'),
    science_mood_2_seg1: require('../../assets/audio/female_m/N05_science_mood_02_TAMMY_M_seg1.mp3'),
    science_mood_2_seg2: require('../../assets/audio/female_m/N05_science_mood_02_TAMMY_M_seg2.mp3'),
    science_mood_3: require('../../assets/audio/female_m/N05_science_mood_03_TAMMY_M.mp3'),
    science_body_1: require('../../assets/audio/female_m/N06_science_posture_01_TAMMY_M.mp3'),
    science_body_2_seg1: require('../../assets/audio/female_m/N06_science_posture_02_TAMMY_M_seg1.mp3'),
    science_body_2_seg2: require('../../assets/audio/female_m/N06_science_posture_02_TAMMY_M_seg2.mp3'),
    science_body_3: require('../../assets/audio/female_m/N06_science_posture_03_TAMMY_M.mp3'),
    uphill_1_seg1: require('../../assets/audio/female_m/O02_motivation_uphill_01_TAMMY_M_seg1.mp3'),
    uphill_1_seg2: require('../../assets/audio/female_m/O02_motivation_uphill_01_TAMMY_M_seg2.mp3'),
    uphill_2_seg1: require('../../assets/audio/female_m/O02_motivation_uphill_02_TAMMY_M_seg1.mp3'),
    uphill_2_seg2: require('../../assets/audio/female_m/O02_motivation_uphill_02_TAMMY_M_seg2.mp3'),
    uphill_3_seg1: require('../../assets/audio/female_m/O02_motivation_uphill_03_TAMMY_M_seg1.mp3'),
    uphill_3_seg2: require('../../assets/audio/female_m/O02_motivation_uphill_03_TAMMY_M_seg2.mp3'),
    milestone_1km_1_seg1: require('../../assets/audio/female_m/A01_milestone_1km_01_TAMMY_M_seg1.mp3'),
    milestone_1km_1_seg2: require('../../assets/audio/female_m/A01_milestone_1km_01_TAMMY_M_seg2.mp3'),
    milestone_1km_2_seg1: require('../../assets/audio/female_m/A01_milestone_1km_02_TAMMY_M_seg1.mp3'),
    milestone_1km_2_seg2: require('../../assets/audio/female_m/A01_milestone_1km_02_TAMMY_M_seg2.mp3'),
    milestone_1km_3_seg1: require('../../assets/audio/female_m/A01_milestone_1km_03_TAMMY_M_seg1.mp3'),
    milestone_1km_3_seg2: require('../../assets/audio/female_m/A01_milestone_1km_03_TAMMY_M_seg2.mp3'),
    milestone_2km_1_seg1: require('../../assets/audio/female_m/A02_milestone_2km_01_TAMMY_M_seg1.mp3'),
    milestone_2km_1_seg2: require('../../assets/audio/female_m/A02_milestone_2km_01_TAMMY_M_seg2.mp3'),
    milestone_2km_2_seg1: require('../../assets/audio/female_m/A02_milestone_2km_02_TAMMY_M_seg1.mp3'),
    milestone_2km_2_seg2: require('../../assets/audio/female_m/A02_milestone_2km_02_TAMMY_M_seg2.mp3'),
    milestone_2km_3_seg1: require('../../assets/audio/female_m/A02_milestone_2km_03_TAMMY_M_seg1.mp3'),
    milestone_2km_3_seg2: require('../../assets/audio/female_m/A02_milestone_2km_03_TAMMY_M_seg2.mp3'),
    milestone_3km_1_seg1: require('../../assets/audio/female_m/A03_milestone_3km_01_TAMMY_M_seg1.mp3'),
    milestone_3km_1_seg2: require('../../assets/audio/female_m/A03_milestone_3km_01_TAMMY_M_seg2.mp3'),
    milestone_3km_2_seg1: require('../../assets/audio/female_m/A03_milestone_3km_02_TAMMY_M_seg1.mp3'),
    milestone_3km_2_seg2: require('../../assets/audio/female_m/A03_milestone_3km_02_TAMMY_M_seg2.mp3'),
    milestone_3km_3_seg1: require('../../assets/audio/female_m/A03_milestone_3km_03_TAMMY_M_seg1.mp3'),
    milestone_3km_3_seg2: require('../../assets/audio/female_m/A03_milestone_3km_03_TAMMY_M_seg2.mp3'),
    milestone_4km_1_seg1: require('../../assets/audio/female_m/A04_milestone_4km_01_TAMMY_M_seg1.mp3'),
    milestone_4km_1_seg2: require('../../assets/audio/female_m/A04_milestone_4km_01_TAMMY_M_seg2.mp3'),
    milestone_4km_2_seg1: require('../../assets/audio/female_m/A04_milestone_4km_02_TAMMY_M_seg1.mp3'),
    milestone_4km_2_seg2: require('../../assets/audio/female_m/A04_milestone_4km_02_TAMMY_M_seg2.mp3'),
    milestone_4km_3_seg1: require('../../assets/audio/female_m/A04_milestone_4km_03_TAMMY_M_seg1.mp3'),
    milestone_4km_3_seg2: require('../../assets/audio/female_m/A04_milestone_4km_03_TAMMY_M_seg2.mp3'),
    milestone_5km_1_seg1: require('../../assets/audio/female_m/A05_milestone_5km_01_TAMMY_M_seg1.mp3'),
    milestone_5km_1_seg2: require('../../assets/audio/female_m/A05_milestone_5km_01_TAMMY_M_seg2.mp3'),
    milestone_5km_2_seg1: require('../../assets/audio/female_m/A05_milestone_5km_02_TAMMY_M_seg1.mp3'),
    milestone_5km_2_seg2: require('../../assets/audio/female_m/A05_milestone_5km_02_TAMMY_M_seg2.mp3'),
    milestone_5km_3_seg1: require('../../assets/audio/female_m/A05_milestone_5km_03_TAMMY_M_seg1.mp3'),
    milestone_5km_3_seg2: require('../../assets/audio/female_m/A05_milestone_5km_03_TAMMY_M_seg2.mp3'),
    quarter_done_1_seg1: require('../../assets/audio/female_m/B01_quarter_done_01_TAMMY_M_seg1.mp3'),
    quarter_done_1_seg2: require('../../assets/audio/female_m/B01_quarter_done_01_TAMMY_M_seg2.mp3'),
    quarter_done_2_seg1: require('../../assets/audio/female_m/B01_quarter_done_02_TAMMY_M_seg1.mp3'),
    quarter_done_2_seg2: require('../../assets/audio/female_m/B01_quarter_done_02_TAMMY_M_seg2.mp3'),
    quarter_done_3_seg1: require('../../assets/audio/female_m/B01_quarter_done_03_TAMMY_M_seg1.mp3'),
    quarter_done_3_seg2: require('../../assets/audio/female_m/B01_quarter_done_03_TAMMY_M_seg2.mp3'),
    halfway_1_seg1: require('../../assets/audio/female_m/B02_halfway_01_TAMMY_M_seg1.mp3'),
    halfway_1_seg2: require('../../assets/audio/female_m/B02_halfway_01_TAMMY_M_seg2.mp3'),
    halfway_2_seg1: require('../../assets/audio/female_m/B02_halfway_02_TAMMY_M_seg1.mp3'),
    halfway_2_seg2: require('../../assets/audio/female_m/B02_halfway_02_TAMMY_M_seg2.mp3'),
    halfway_3_seg1: require('../../assets/audio/female_m/B02_halfway_03_TAMMY_M_seg1.mp3'),
    halfway_3_seg2: require('../../assets/audio/female_m/B02_halfway_03_TAMMY_M_seg2.mp3'),
    halfway_4_seg1: require('../../assets/audio/female_m/B02_halfway_04_TAMMY_M_seg1.mp3'),
    halfway_4_seg2: require('../../assets/audio/female_m/B02_halfway_04_TAMMY_M_seg2.mp3'),
    three_quarters_1_seg1: require('../../assets/audio/female_m/B03_three_quarters_01_TAMMY_M_seg1.mp3'),
    three_quarters_1_seg2: require('../../assets/audio/female_m/B03_three_quarters_01_TAMMY_M_seg2.mp3'),
    three_quarters_2_seg1: require('../../assets/audio/female_m/B03_three_quarters_02_TAMMY_M_seg1.mp3'),
    three_quarters_2_seg2: require('../../assets/audio/female_m/B03_three_quarters_02_TAMMY_M_seg2.mp3'),
    three_quarters_3_seg1: require('../../assets/audio/female_m/B03_three_quarters_03_TAMMY_M_seg1.mp3'),
    three_quarters_3_seg2: require('../../assets/audio/female_m/B03_three_quarters_03_TAMMY_M_seg2.mp3'),
    last_min_cooldown_1_seg1: require('../../assets/audio/female_m/B04_last_min_cooldown_01_TAMMY_M_seg1.mp3'),
    last_min_cooldown_1_seg2: require('../../assets/audio/female_m/B04_last_min_cooldown_01_TAMMY_M_seg2.mp3'),
    last_min_cooldown_2_seg1: require('../../assets/audio/female_m/B04_last_min_cooldown_02_TAMMY_M_seg1.mp3'),
    last_min_cooldown_2_seg2: require('../../assets/audio/female_m/B04_last_min_cooldown_02_TAMMY_M_seg2.mp3'),
    last_min_cooldown_3_seg1: require('../../assets/audio/female_m/B04_last_min_cooldown_03_TAMMY_M_seg1.mp3'),
    last_min_cooldown_3_seg2: require('../../assets/audio/female_m/B04_last_min_cooldown_03_TAMMY_M_seg2.mp3'),
    workout_complete_1_seg1: require('../../assets/audio/female_m/B05_workout_complete_01_TAMMY_M_seg1.mp3'),
    workout_complete_1_seg2: require('../../assets/audio/female_m/B05_workout_complete_01_TAMMY_M_seg2.mp3'),
    workout_complete_2_seg1: require('../../assets/audio/female_m/B05_workout_complete_02_TAMMY_M_seg1.mp3'),
    workout_complete_2_seg2: require('../../assets/audio/female_m/B05_workout_complete_02_TAMMY_M_seg2.mp3'),
    workout_complete_3_seg1: require('../../assets/audio/female_m/B05_workout_complete_03_TAMMY_M_seg1.mp3'),
    workout_complete_3_seg2: require('../../assets/audio/female_m/B05_workout_complete_03_TAMMY_M_seg2.mp3'),
    workout_complete_4_seg1: require('../../assets/audio/female_m/B05_workout_complete_04_TAMMY_M_seg1.mp3'),
    workout_complete_4_seg2: require('../../assets/audio/female_m/B05_workout_complete_04_TAMMY_M_seg2.mp3'),
    badge_first_workout_1_seg1: require('../../assets/audio/female_m/B06_badge_first_workout_01_TAMMY_M_seg1.mp3'),
    badge_first_workout_1_seg2: require('../../assets/audio/female_m/B06_badge_first_workout_01_TAMMY_M_seg2.mp3'),
    badge_first_workout_2_seg1: require('../../assets/audio/female_m/B06_badge_first_workout_02_TAMMY_M_seg1.mp3'),
    badge_first_workout_2_seg2: require('../../assets/audio/female_m/B06_badge_first_workout_02_TAMMY_M_seg2.mp3'),
    badge_first_workout_3_seg1: require('../../assets/audio/female_m/B06_badge_first_workout_03_TAMMY_M_seg1.mp3'),
    badge_first_workout_3_seg2: require('../../assets/audio/female_m/B06_badge_first_workout_03_TAMMY_M_seg2.mp3'),
    badge_streak_7_1_seg1: require('../../assets/audio/female_m/B07_badge_streak_7_01_TAMMY_M_seg1.mp3'),
    badge_streak_7_1_seg2: require('../../assets/audio/female_m/B07_badge_streak_7_01_TAMMY_M_seg2.mp3'),
    badge_streak_7_2_seg1: require('../../assets/audio/female_m/B07_badge_streak_7_02_TAMMY_M_seg1.mp3'),
    badge_streak_7_2_seg2: require('../../assets/audio/female_m/B07_badge_streak_7_02_TAMMY_M_seg2.mp3'),
    badge_streak_7_3_seg1: require('../../assets/audio/female_m/B07_badge_streak_7_03_TAMMY_M_seg1.mp3'),
    badge_streak_7_3_seg2: require('../../assets/audio/female_m/B07_badge_streak_7_03_TAMMY_M_seg2.mp3'),
    badge_10k_steps_1_seg1: require('../../assets/audio/female_m/B08_badge_10k_steps_01_TAMMY_M_seg1.mp3'),
    badge_10k_steps_1_seg2: require('../../assets/audio/female_m/B08_badge_10k_steps_01_TAMMY_M_seg2.mp3'),
    badge_10k_steps_2_seg1: require('../../assets/audio/female_m/B08_badge_10k_steps_02_TAMMY_M_seg1.mp3'),
    badge_10k_steps_2_seg2: require('../../assets/audio/female_m/B08_badge_10k_steps_02_TAMMY_M_seg2.mp3'),
    badge_10k_steps_3_seg1: require('../../assets/audio/female_m/B08_badge_10k_steps_03_TAMMY_M_seg1.mp3'),
    badge_10k_steps_3_seg2: require('../../assets/audio/female_m/B08_badge_10k_steps_03_TAMMY_M_seg2.mp3'),
    badge_5km_total_1_seg1: require('../../assets/audio/female_m/B09_badge_5km_total_01_TAMMY_M_seg1.mp3'),
    badge_5km_total_1_seg2: require('../../assets/audio/female_m/B09_badge_5km_total_01_TAMMY_M_seg2.mp3'),
    badge_5km_total_2_seg1: require('../../assets/audio/female_m/B09_badge_5km_total_02_TAMMY_M_seg1.mp3'),
    badge_5km_total_2_seg2: require('../../assets/audio/female_m/B09_badge_5km_total_02_TAMMY_M_seg2.mp3'),
    badge_5km_total_3_seg1: require('../../assets/audio/female_m/B09_badge_5km_total_03_TAMMY_M_seg1.mp3'),
    badge_5km_total_3_seg2: require('../../assets/audio/female_m/B09_badge_5km_total_03_TAMMY_M_seg2.mp3'),
    badge_full_week_1_seg1: require('../../assets/audio/female_m/B10_badge_full_week_01_TAMMY_M_seg1.mp3'),
    badge_full_week_1_seg2: require('../../assets/audio/female_m/B10_badge_full_week_01_TAMMY_M_seg2.mp3'),
    badge_full_week_2_seg1: require('../../assets/audio/female_m/B10_badge_full_week_02_TAMMY_M_seg1.mp3'),
    badge_full_week_2_seg2: require('../../assets/audio/female_m/B10_badge_full_week_02_TAMMY_M_seg2.mp3'),
    badge_full_week_3_seg1: require('../../assets/audio/female_m/B10_badge_full_week_03_TAMMY_M_seg1.mp3'),
    badge_full_week_3_seg2: require('../../assets/audio/female_m/B10_badge_full_week_03_TAMMY_M_seg2.mp3'),
    badge_speed_demon_1_seg1: require('../../assets/audio/female_m/B11_badge_speed_demon_01_TAMMY_M_seg1.mp3'),
    badge_speed_demon_1_seg2: require('../../assets/audio/female_m/B11_badge_speed_demon_01_TAMMY_M_seg2.mp3'),
    badge_speed_demon_2_seg1: require('../../assets/audio/female_m/B11_badge_speed_demon_02_TAMMY_M_seg1.mp3'),
    badge_speed_demon_2_seg2: require('../../assets/audio/female_m/B11_badge_speed_demon_02_TAMMY_M_seg2.mp3'),
    badge_speed_demon_3_seg1: require('../../assets/audio/female_m/B11_badge_speed_demon_03_TAMMY_M_seg1.mp3'),
    badge_speed_demon_3_seg2: require('../../assets/audio/female_m/B11_badge_speed_demon_03_TAMMY_M_seg2.mp3'),
    badge_goal_reached_1_seg1: require('../../assets/audio/female_m/B12_badge_goal_reached_01_TAMMY_M_seg1.mp3'),
    badge_goal_reached_1_seg2: require('../../assets/audio/female_m/B12_badge_goal_reached_01_TAMMY_M_seg2.mp3'),
    badge_goal_reached_2_seg1: require('../../assets/audio/female_m/B12_badge_goal_reached_02_TAMMY_M_seg1.mp3'),
    badge_goal_reached_2_seg2: require('../../assets/audio/female_m/B12_badge_goal_reached_02_TAMMY_M_seg2.mp3'),
    badge_goal_reached_3_seg1: require('../../assets/audio/female_m/B12_badge_goal_reached_03_TAMMY_M_seg1.mp3'),
    badge_goal_reached_3_seg2: require('../../assets/audio/female_m/B12_badge_goal_reached_03_TAMMY_M_seg2.mp3'),
    invalid_workout_1: require('../../assets/audio/female_m/B13_invalid_workout_01_TAMMY_M.mp3'),
    invalid_workout_2: require('../../assets/audio/female_m/B13_invalid_workout_02_TAMMY_M.mp3'),
    invalid_workout_3: require('../../assets/audio/female_m/B13_invalid_workout_03_TAMMY_M.mp3'),
    pause_1: require('../../assets/audio/female_m/B14_pause_01_TAMMY_M.mp3'),
    pause_2: require('../../assets/audio/female_m/B14_pause_02_TAMMY_M.mp3'),
    pause_3: require('../../assets/audio/female_m/B14_pause_03_TAMMY_M.mp3'),
    resume_1: require('../../assets/audio/female_m/B15_resume_01_TAMMY_M.mp3'),
    resume_2: require('../../assets/audio/female_m/B15_resume_02_TAMMY_M.mp3'),
    resume_3: require('../../assets/audio/female_m/B15_resume_03_TAMMY_M.mp3'),
    Q01_duration_01: require('../../assets/audio/female_m/Q01_duration_01_TAMMY_M.mp3'),
    Q01_duration_02: require('../../assets/audio/female_m/Q01_duration_02_TAMMY_M.mp3'),
    Q01_duration_03: require('../../assets/audio/female_m/Q01_duration_03_TAMMY_M.mp3'),
    Q01_duration_04: require('../../assets/audio/female_m/Q01_duration_04_TAMMY_M.mp3'),
    Q01_duration_05: require('../../assets/audio/female_m/Q01_duration_05_TAMMY_M.mp3'),
    Q01_duration_06: require('../../assets/audio/female_m/Q01_duration_06_TAMMY_M.mp3'),
    Q01_duration_07: require('../../assets/audio/female_m/Q01_duration_07_TAMMY_M.mp3'),
    Q01_duration_08: require('../../assets/audio/female_m/Q01_duration_08_TAMMY_M.mp3'),
    Q01_duration_09: require('../../assets/audio/female_m/Q01_duration_09_TAMMY_M.mp3'),
    Q01_duration_10: require('../../assets/audio/female_m/Q01_duration_10_TAMMY_M.mp3'),
    Q01_duration_11: require('../../assets/audio/female_m/Q01_duration_11_TAMMY_M.mp3'),
    Q01_duration_12: require('../../assets/audio/female_m/Q01_duration_12_TAMMY_M.mp3'),
    Q01_duration_13: require('../../assets/audio/female_m/Q01_duration_13_TAMMY_M.mp3'),
    Q01_duration_14: require('../../assets/audio/female_m/Q01_duration_14_TAMMY_M.mp3'),
    Q01_duration_15: require('../../assets/audio/female_m/Q01_duration_15_TAMMY_M.mp3'),
    warmup_announce_01_seg1: require('../../assets/audio/female_m/Q02_warmup_announce_01_TAMMY_M_seg1.mp3'),
    warmup_announce_01_seg2: require('../../assets/audio/female_m/Q02_warmup_announce_01_TAMMY_M_seg2.mp3'),
    warmup_announce_02_seg1: require('../../assets/audio/female_m/Q02_warmup_announce_02_TAMMY_M_seg1.mp3'),
    warmup_announce_02_seg2: require('../../assets/audio/female_m/Q02_warmup_announce_02_TAMMY_M_seg2.mp3'),
    warmup_announce_03_seg1: require('../../assets/audio/female_m/Q02_warmup_announce_03_TAMMY_M_seg1.mp3'),
    warmup_announce_03_seg2: require('../../assets/audio/female_m/Q02_warmup_announce_03_TAMMY_M_seg2.mp3'),
    moderate_announce_01_seg1: require('../../assets/audio/female_m/Q03_moderate_announce_01_TAMMY_M_seg1.mp3'),
    moderate_announce_01_seg2: require('../../assets/audio/female_m/Q03_moderate_announce_01_TAMMY_M_seg2.mp3'),
    moderate_announce_02_seg1: require('../../assets/audio/female_m/Q03_moderate_announce_02_TAMMY_M_seg1.mp3'),
    moderate_announce_02_seg2: require('../../assets/audio/female_m/Q03_moderate_announce_02_TAMMY_M_seg2.mp3'),
    moderate_announce_03_seg1: require('../../assets/audio/female_m/Q03_moderate_announce_03_TAMMY_M_seg1.mp3'),
    moderate_announce_03_seg2: require('../../assets/audio/female_m/Q03_moderate_announce_03_TAMMY_M_seg2.mp3'),
    fast_announce_01_seg1: require('../../assets/audio/female_m/Q04_fast_announce_01_TAMMY_M_seg1.mp3'),
    fast_announce_01_seg2: require('../../assets/audio/female_m/Q04_fast_announce_01_TAMMY_M_seg2.mp3'),
    fast_announce_02_seg1: require('../../assets/audio/female_m/Q04_fast_announce_02_TAMMY_M_seg1.mp3'),
    fast_announce_02_seg2: require('../../assets/audio/female_m/Q04_fast_announce_02_TAMMY_M_seg2.mp3'),
    fast_announce_03_seg1: require('../../assets/audio/female_m/Q04_fast_announce_03_TAMMY_M_seg1.mp3'),
    fast_announce_03_seg2: require('../../assets/audio/female_m/Q04_fast_announce_03_TAMMY_M_seg2.mp3'),
    fast_announce_04_seg1: require('../../assets/audio/female_m/Q04_fast_announce_04_TAMMY_M_seg1.mp3'),
    fast_announce_04_seg2: require('../../assets/audio/female_m/Q04_fast_announce_04_TAMMY_M_seg2.mp3'),
    cooldown_announce_01_seg1: require('../../assets/audio/female_m/Q05_cooldown_announce_01_TAMMY_M_seg1.mp3'),
    cooldown_announce_01_seg2: require('../../assets/audio/female_m/Q05_cooldown_announce_01_TAMMY_M_seg2.mp3'),
    cooldown_announce_02_seg1: require('../../assets/audio/female_m/Q05_cooldown_announce_02_TAMMY_M_seg1.mp3'),
    cooldown_announce_02_seg2: require('../../assets/audio/female_m/Q05_cooldown_announce_02_TAMMY_M_seg2.mp3'),
    cooldown_announce_03_seg1: require('../../assets/audio/female_m/Q05_cooldown_announce_03_TAMMY_M_seg1.mp3'),
    cooldown_announce_03_seg2: require('../../assets/audio/female_m/Q05_cooldown_announce_03_TAMMY_M_seg2.mp3'),
  },
  female_f: {
    workout_start_1_seg1: require('../../assets/audio/female_f/D01_warmup_start_01_TAMMY_F_seg1.mp3'),
    workout_start_1_seg2: require('../../assets/audio/female_f/D01_warmup_start_01_TAMMY_F_seg2.mp3'),
    workout_start_2_seg1: require('../../assets/audio/female_f/D01_warmup_start_02_TAMMY_F_seg1.mp3'),
    workout_start_2_seg2: require('../../assets/audio/female_f/D01_warmup_start_02_TAMMY_F_seg2.mp3'),
    workout_start_3_seg1: require('../../assets/audio/female_f/D01_warmup_start_03_TAMMY_F_seg1.mp3'),
    workout_start_3_seg2: require('../../assets/audio/female_f/D01_warmup_start_03_TAMMY_F_seg2.mp3'),
    interval_moderate_1_seg1: require('../../assets/audio/female_f/D03_phase_moderate_01_TAMMY_F_seg1.mp3'),
    interval_moderate_1_seg2: require('../../assets/audio/female_f/D03_phase_moderate_01_TAMMY_F_seg2.mp3'),
    interval_moderate_2_seg1: require('../../assets/audio/female_f/D03_phase_moderate_02_TAMMY_F_seg1.mp3'),
    interval_moderate_2_seg2: require('../../assets/audio/female_f/D03_phase_moderate_02_TAMMY_F_seg2.mp3'),
    interval_moderate_3_seg1: require('../../assets/audio/female_f/D03_phase_moderate_03_TAMMY_F_seg1.mp3'),
    interval_fast_1_seg1: require('../../assets/audio/female_f/D04_phase_sustained_01_TAMMY_F_seg1.mp3'),
    interval_fast_1_seg2: require('../../assets/audio/female_f/D04_phase_sustained_01_TAMMY_F_seg2.mp3'),
    interval_fast_2_seg1: require('../../assets/audio/female_f/D04_phase_sustained_02_TAMMY_F_seg1.mp3'),
    interval_fast_2_seg2: require('../../assets/audio/female_f/D04_phase_sustained_02_TAMMY_F_seg2.mp3'),
    interval_fast_3_seg1: require('../../assets/audio/female_f/D04_phase_sustained_03_TAMMY_F_seg1.mp3'),
    interval_fast_3_seg2: require('../../assets/audio/female_f/D04_phase_sustained_03_TAMMY_F_seg2.mp3'),
    interval_fast_4_seg1: require('../../assets/audio/female_f/D04_phase_sustained_04_TAMMY_F_seg1.mp3'),
    interval_fast_4_seg2: require('../../assets/audio/female_f/D04_phase_sustained_04_TAMMY_F_seg2.mp3'),
    cooldown_1_seg1: require('../../assets/audio/female_f/D05_phase_recovery_01_TAMMY_F_seg1.mp3'),
    cooldown_1_seg2: require('../../assets/audio/female_f/D05_phase_recovery_01_TAMMY_F_seg2.mp3'),
    cooldown_2_seg1: require('../../assets/audio/female_f/D05_phase_recovery_02_TAMMY_F_seg1.mp3'),
    cooldown_2_seg2: require('../../assets/audio/female_f/D05_phase_recovery_02_TAMMY_F_seg2.mp3'),
    cooldown_3_seg1: require('../../assets/audio/female_f/D05_phase_recovery_03_TAMMY_F_seg1.mp3'),
    cooldown_3_seg2: require('../../assets/audio/female_f/D05_phase_recovery_03_TAMMY_F_seg2.mp3'),
    motivation_random_1_seg1: require('../../assets/audio/female_f/O01_motivation_push_01_TAMMY_F_seg1.mp3'),
    motivation_random_1_seg2: require('../../assets/audio/female_f/O01_motivation_push_01_TAMMY_F_seg2.mp3'),
    motivation_random_2: require('../../assets/audio/female_f/O01_motivation_push_02_TAMMY_F.mp3'),
    motivation_random_3: require('../../assets/audio/female_f/O01_motivation_push_03_TAMMY_F.mp3'),
    motivation_random_4_seg1: require('../../assets/audio/female_f/O01_motivation_push_04_TAMMY_F_seg1.mp3'),
    motivation_random_4_seg2: require('../../assets/audio/female_f/O01_motivation_push_04_TAMMY_F_seg2.mp3'),
    last_minute_1: require('../../assets/audio/female_f/O03_final_push_01_TAMMY_F.mp3'),
    last_minute_2: require('../../assets/audio/female_f/O03_final_push_02_TAMMY_F.mp3'),
    last_minute_3: require('../../assets/audio/female_f/O03_final_push_03_TAMMY_F.mp3'),
    last_minute_4: require('../../assets/audio/female_f/O03_final_push_04_TAMMY_F.mp3'),
    last_30_seconds_1: require('../../assets/audio/female_f/O03_final_push_05_TAMMY_F.mp3'),
    last_30_seconds_2: require('../../assets/audio/female_f/O03_final_push_06_TAMMY_F.mp3'),
    last_30_seconds_3: require('../../assets/audio/female_f/O03_final_push_07_TAMMY_F.mp3'),
    badge_rain_walker_1: require('../../assets/audio/female_f/C01_rain_walker_01_TAMMY_F.mp3'),
    badge_rain_walker_2_seg1: require('../../assets/audio/female_f/C01_rain_walker_02_TAMMY_F_seg1.mp3'),
    badge_rain_walker_2_seg2: require('../../assets/audio/female_f/C01_rain_walker_02_TAMMY_F_seg2.mp3'),
    badge_rain_walker_3_seg1: require('../../assets/audio/female_f/C01_rain_walker_03_TAMMY_F_seg1.mp3'),
    badge_rain_walker_3_seg2: require('../../assets/audio/female_f/C01_rain_walker_03_TAMMY_F_seg2.mp3'),
    badge_ice_walker_1_seg1: require('../../assets/audio/female_f/C02_ice_walker_01_TAMMY_F_seg1.mp3'),
    badge_ice_walker_2: require('../../assets/audio/female_f/C02_ice_walker_02_TAMMY_F.mp3'),
    badge_ice_walker_3_seg1: require('../../assets/audio/female_f/C02_ice_walker_03_TAMMY_F_seg1.mp3'),
    badge_ice_walker_3_seg2: require('../../assets/audio/female_f/C02_ice_walker_03_TAMMY_F_seg2.mp3'),
    badge_heat_warrior_1: require('../../assets/audio/female_f/C03_heat_warrior_01_TAMMY_F.mp3'),
    badge_heat_warrior_2_seg1: require('../../assets/audio/female_f/C03_heat_warrior_02_TAMMY_F_seg1.mp3'),
    badge_heat_warrior_2_seg2: require('../../assets/audio/female_f/C03_heat_warrior_02_TAMMY_F_seg2.mp3'),
    badge_heat_warrior_3_seg1: require('../../assets/audio/female_f/C03_heat_warrior_03_TAMMY_F_seg1.mp3'),
    badge_heat_warrior_3_seg2: require('../../assets/audio/female_f/C03_heat_warrior_03_TAMMY_F_seg2.mp3'),
    badge_wind_rider_1: require('../../assets/audio/female_f/C04_wind_rider_01_TAMMY_F.mp3'),
    badge_wind_rider_2_seg1: require('../../assets/audio/female_f/C04_wind_rider_02_TAMMY_F_seg1.mp3'),
    badge_wind_rider_2_seg2: require('../../assets/audio/female_f/C04_wind_rider_02_TAMMY_F_seg2.mp3'),
    badge_wind_rider_3_seg1: require('../../assets/audio/female_f/C04_wind_rider_03_TAMMY_F_seg1.mp3'),
    badge_wind_rider_3_seg2: require('../../assets/audio/female_f/C04_wind_rider_03_TAMMY_F_seg2.mp3'),
    badge_early_bird_1: require('../../assets/audio/female_f/C05_early_bird_01_TAMMY_F.mp3'),
    badge_early_bird_2_seg1: require('../../assets/audio/female_f/C05_early_bird_02_TAMMY_F_seg1.mp3'),
    badge_early_bird_2_seg2: require('../../assets/audio/female_f/C05_early_bird_02_TAMMY_F_seg2.mp3'),
    badge_early_bird_3_seg1: require('../../assets/audio/female_f/C05_early_bird_03_TAMMY_F_seg1.mp3'),
    badge_early_bird_3_seg2: require('../../assets/audio/female_f/C05_early_bird_03_TAMMY_F_seg2.mp3'),
    badge_night_owl_1: require('../../assets/audio/female_f/C06_night_owl_01_TAMMY_F.mp3'),
    badge_night_owl_2_seg1: require('../../assets/audio/female_f/C06_night_owl_02_TAMMY_F_seg1.mp3'),
    badge_night_owl_2_seg2: require('../../assets/audio/female_f/C06_night_owl_02_TAMMY_F_seg2.mp3'),
    badge_night_owl_3: require('../../assets/audio/female_f/C06_night_owl_03_TAMMY_F.mp3'),
    badge_all_weather_1: require('../../assets/audio/female_f/C07_all_weather_01_TAMMY_F.mp3'),
    badge_all_weather_2_seg1: require('../../assets/audio/female_f/C07_all_weather_02_TAMMY_F_seg1.mp3'),
    badge_all_weather_2_seg2: require('../../assets/audio/female_f/C07_all_weather_02_TAMMY_F_seg2.mp3'),
    badge_all_weather_3_seg1: require('../../assets/audio/female_f/C07_all_weather_03_TAMMY_F_seg1.mp3'),
    badge_all_weather_3_seg2: require('../../assets/audio/female_f/C07_all_weather_03_TAMMY_F_seg2.mp3'),
    badge_unstoppable_1: require('../../assets/audio/female_f/C08_unstoppable_01_TAMMY_F.mp3'),
    badge_unstoppable_2_seg1: require('../../assets/audio/female_f/C08_unstoppable_02_TAMMY_F_seg1.mp3'),
    badge_unstoppable_2_seg2: require('../../assets/audio/female_f/C08_unstoppable_02_TAMMY_F_seg2.mp3'),
    badge_unstoppable_3_seg1: require('../../assets/audio/female_f/C08_unstoppable_03_TAMMY_F_seg1.mp3'),
    badge_unstoppable_3_seg2: require('../../assets/audio/female_f/C08_unstoppable_03_TAMMY_F_seg2.mp3'),
    badge_dawn_patrol_1: require('../../assets/audio/female_f/C09_dawn_patrol_01_TAMMY_F.mp3'),
    badge_dawn_patrol_2_seg1: require('../../assets/audio/female_f/C09_dawn_patrol_02_TAMMY_F_seg1.mp3'),
    badge_dawn_patrol_2_seg2: require('../../assets/audio/female_f/C09_dawn_patrol_02_TAMMY_F_seg2.mp3'),
    badge_dawn_patrol_3_seg1: require('../../assets/audio/female_f/C09_dawn_patrol_03_TAMMY_F_seg1.mp3'),
    badge_dawn_patrol_3_seg2: require('../../assets/audio/female_f/C09_dawn_patrol_03_TAMMY_F_seg2.mp3'),
    badge_sunset_lover_1: require('../../assets/audio/female_f/C10_sunset_lover_01_TAMMY_F.mp3'),
    badge_sunset_lover_2_seg1: require('../../assets/audio/female_f/C10_sunset_lover_02_TAMMY_F_seg1.mp3'),
    badge_sunset_lover_2_seg2: require('../../assets/audio/female_f/C10_sunset_lover_02_TAMMY_F_seg2.mp3'),
    badge_sunset_lover_3_seg1: require('../../assets/audio/female_f/C10_sunset_lover_03_TAMMY_F_seg1.mp3'),
    badge_sunset_lover_3_seg2: require('../../assets/audio/female_f/C10_sunset_lover_03_TAMMY_F_seg2.mp3'),
    badge_lunch_hero_1: require('../../assets/audio/female_f/C11_lunch_hero_01_TAMMY_F.mp3'),
    badge_lunch_hero_2_seg1: require('../../assets/audio/female_f/C11_lunch_hero_02_TAMMY_F_seg1.mp3'),
    badge_lunch_hero_2_seg2: require('../../assets/audio/female_f/C11_lunch_hero_02_TAMMY_F_seg2.mp3'),
    badge_lunch_hero_3_seg1: require('../../assets/audio/female_f/C11_lunch_hero_03_TAMMY_F_seg1.mp3'),
    badge_lunch_hero_3_seg2: require('../../assets/audio/female_f/C11_lunch_hero_03_TAMMY_F_seg2.mp3'),
    badge_four_seasons_1: require('../../assets/audio/female_f/C12_four_seasons_01_TAMMY_F.mp3'),
    badge_four_seasons_2_seg1: require('../../assets/audio/female_f/C12_four_seasons_02_TAMMY_F_seg1.mp3'),
    badge_four_seasons_2_seg2: require('../../assets/audio/female_f/C12_four_seasons_02_TAMMY_F_seg2.mp3'),
    badge_four_seasons_3_seg1: require('../../assets/audio/female_f/C12_four_seasons_03_TAMMY_F_seg1.mp3'),
    badge_four_seasons_3_seg2: require('../../assets/audio/female_f/C12_four_seasons_03_TAMMY_F_seg2.mp3'),
    body_hydration_1_seg1: require('../../assets/audio/female_f/E01_hydration_01_TAMMY_F_seg1.mp3'),
    body_hydration_1_seg2: require('../../assets/audio/female_f/E01_hydration_01_TAMMY_F_seg2.mp3'),
    body_hydration_2_seg1: require('../../assets/audio/female_f/E01_hydration_02_TAMMY_F_seg1.mp3'),
    body_hydration_2_seg2: require('../../assets/audio/female_f/E01_hydration_02_TAMMY_F_seg2.mp3'),
    body_hydration_3_seg1: require('../../assets/audio/female_f/E01_hydration_03_TAMMY_F_seg1.mp3'),
    body_hydration_3_seg2: require('../../assets/audio/female_f/E01_hydration_03_TAMMY_F_seg2.mp3'),
    body_hydration_4_seg1: require('../../assets/audio/female_f/E01_hydration_04_TAMMY_F_seg1.mp3'),
    body_hydration_4_seg2: require('../../assets/audio/female_f/E01_hydration_04_TAMMY_F_seg2.mp3'),
    body_posture_1_seg1: require('../../assets/audio/female_f/E02_posture_01_TAMMY_F_seg1.mp3'),
    body_posture_1_seg2: require('../../assets/audio/female_f/E02_posture_01_TAMMY_F_seg2.mp3'),
    body_posture_2: require('../../assets/audio/female_f/E02_posture_02_TAMMY_F.mp3'),
    body_posture_3: require('../../assets/audio/female_f/E02_posture_03_TAMMY_F.mp3'),
    body_posture_4_seg1: require('../../assets/audio/female_f/E02_posture_04_TAMMY_F_seg1.mp3'),
    body_posture_4_seg2: require('../../assets/audio/female_f/E02_posture_04_TAMMY_F_seg2.mp3'),
    body_breathing_1: require('../../assets/audio/female_f/E03_breathing_01_TAMMY_F.mp3'),
    body_breathing_2: require('../../assets/audio/female_f/E03_breathing_02_TAMMY_F.mp3'),
    body_breathing_3: require('../../assets/audio/female_f/E03_breathing_03_TAMMY_F.mp3'),
    body_breathing_4: require('../../assets/audio/female_f/E03_breathing_04_TAMMY_F.mp3'),
    body_cadence_1: require('../../assets/audio/female_f/E04_cadence_01_TAMMY_F.mp3'),
    body_cadence_2: require('../../assets/audio/female_f/E04_cadence_02_TAMMY_F.mp3'),
    body_cadence_3: require('../../assets/audio/female_f/E04_cadence_03_TAMMY_F.mp3'),
    speed_fast_1: require('../../assets/audio/female_f/F01_speed_fast_01_TAMMY_F.mp3'),
    speed_fast_2_seg1: require('../../assets/audio/female_f/F01_speed_fast_02_TAMMY_F_seg1.mp3'),
    speed_fast_2_seg2: require('../../assets/audio/female_f/F01_speed_fast_02_TAMMY_F_seg2.mp3'),
    speed_fast_3: require('../../assets/audio/female_f/F01_speed_fast_03_TAMMY_F.mp3'),
    speed_too_slow_1: require('../../assets/audio/female_f/F02_speed_slow_01_TAMMY_F.mp3'),
    speed_too_slow_2: require('../../assets/audio/female_f/F02_speed_slow_02_TAMMY_F.mp3'),
    speed_too_slow_3_seg1: require('../../assets/audio/female_f/F02_speed_slow_03_TAMMY_F_seg1.mp3'),
    speed_too_slow_3_seg2: require('../../assets/audio/female_f/F02_speed_slow_03_TAMMY_F_seg2.mp3'),
    speed_good_1_seg1: require('../../assets/audio/female_f/F03_speed_perfect_01_TAMMY_F_seg1.mp3'),
    speed_good_1_seg2: require('../../assets/audio/female_f/F03_speed_perfect_01_TAMMY_F_seg2.mp3'),
    speed_good_2_seg1: require('../../assets/audio/female_f/F03_speed_perfect_02_TAMMY_F_seg1.mp3'),
    speed_good_2_seg2: require('../../assets/audio/female_f/F03_speed_perfect_02_TAMMY_F_seg2.mp3'),
    speed_good_3_seg1: require('../../assets/audio/female_f/F03_speed_perfect_03_TAMMY_F_seg1.mp3'),
    speed_good_3_seg2: require('../../assets/audio/female_f/F03_speed_perfect_03_TAMMY_F_seg2.mp3'),
    weather_rain_1_seg1: require('../../assets/audio/female_f/G01_weather_rain_01_TAMMY_F_seg1.mp3'),
    weather_rain_1_seg2: require('../../assets/audio/female_f/G01_weather_rain_01_TAMMY_F_seg2.mp3'),
    weather_rain_2_seg1: require('../../assets/audio/female_f/G01_weather_rain_02_TAMMY_F_seg1.mp3'),
    weather_rain_2_seg2: require('../../assets/audio/female_f/G01_weather_rain_02_TAMMY_F_seg2.mp3'),
    weather_rain_3: require('../../assets/audio/female_f/G01_weather_rain_03_TAMMY_F.mp3'),
    weather_cold_1: require('../../assets/audio/female_f/G02_weather_cold_01_TAMMY_F.mp3'),
    weather_cold_2: require('../../assets/audio/female_f/G02_weather_cold_02_TAMMY_F.mp3'),
    weather_cold_3_seg1: require('../../assets/audio/female_f/G02_weather_cold_03_TAMMY_F_seg1.mp3'),
    weather_cold_3_seg2: require('../../assets/audio/female_f/G02_weather_cold_03_TAMMY_F_seg2.mp3'),
    weather_heat_1: require('../../assets/audio/female_f/G03_weather_hot_01_TAMMY_F.mp3'),
    weather_heat_2: require('../../assets/audio/female_f/G03_weather_hot_02_TAMMY_F.mp3'),
    weather_heat_3_seg1: require('../../assets/audio/female_f/G03_weather_hot_03_TAMMY_F_seg1.mp3'),
    weather_heat_3_seg2: require('../../assets/audio/female_f/G03_weather_hot_03_TAMMY_F_seg2.mp3'),
    weather_heat_4_seg1: require('../../assets/audio/female_f/G03_weather_hot_04_TAMMY_F_seg1.mp3'),
    weather_heat_4_seg2: require('../../assets/audio/female_f/G03_weather_hot_04_TAMMY_F_seg2.mp3'),
    weather_wind_1_seg1: require('../../assets/audio/female_f/G04_weather_wind_01_TAMMY_F_seg1.mp3'),
    weather_wind_1_seg2: require('../../assets/audio/female_f/G04_weather_wind_01_TAMMY_F_seg2.mp3'),
    weather_wind_2: require('../../assets/audio/female_f/G04_weather_wind_02_TAMMY_F.mp3'),
    weather_wind_3: require('../../assets/audio/female_f/G04_weather_wind_03_TAMMY_F.mp3'),
    time_predawn_1: require('../../assets/audio/female_f/H01_time_predawn_01_TAMMY_F.mp3'),
    time_predawn_2_seg1: require('../../assets/audio/female_f/H01_time_predawn_02_TAMMY_F_seg1.mp3'),
    time_predawn_2_seg2: require('../../assets/audio/female_f/H01_time_predawn_02_TAMMY_F_seg2.mp3'),
    time_predawn_3_seg1: require('../../assets/audio/female_f/H01_time_predawn_03_TAMMY_F_seg1.mp3'),
    time_predawn_3_seg2: require('../../assets/audio/female_f/H01_time_predawn_03_TAMMY_F_seg2.mp3'),
    time_dawn_1_seg1: require('../../assets/audio/female_f/H02_time_dawn_01_TAMMY_F_seg1.mp3'),
    time_dawn_1_seg2: require('../../assets/audio/female_f/H02_time_dawn_01_TAMMY_F_seg2.mp3'),
    time_dawn_2: require('../../assets/audio/female_f/H02_time_dawn_02_TAMMY_F.mp3'),
    time_dawn_3_seg1: require('../../assets/audio/female_f/H02_time_dawn_03_TAMMY_F_seg1.mp3'),
    time_dawn_3_seg2: require('../../assets/audio/female_f/H02_time_dawn_03_TAMMY_F_seg2.mp3'),
    time_lunch_1_seg1: require('../../assets/audio/female_f/H03_time_lunch_01_TAMMY_F_seg1.mp3'),
    time_lunch_1_seg2: require('../../assets/audio/female_f/H03_time_lunch_01_TAMMY_F_seg2.mp3'),
    time_lunch_2: require('../../assets/audio/female_f/H03_time_lunch_02_TAMMY_F.mp3'),
    time_lunch_3_seg1: require('../../assets/audio/female_f/H03_time_lunch_03_TAMMY_F_seg1.mp3'),
    time_lunch_3_seg2: require('../../assets/audio/female_f/H03_time_lunch_03_TAMMY_F_seg2.mp3'),
    time_sunset_1_seg1: require('../../assets/audio/female_f/H04_time_sunset_01_TAMMY_F_seg1.mp3'),
    time_sunset_2_seg1: require('../../assets/audio/female_f/H04_time_sunset_02_TAMMY_F_seg1.mp3'),
    time_sunset_3_seg1: require('../../assets/audio/female_f/H04_time_sunset_03_TAMMY_F_seg1.mp3'),
    time_sunset_3_seg2: require('../../assets/audio/female_f/H04_time_sunset_03_TAMMY_F_seg2.mp3'),
    time_night_1_seg1: require('../../assets/audio/female_f/H05_time_night_01_TAMMY_F_seg1.mp3'),
    time_night_1_seg2: require('../../assets/audio/female_f/H05_time_night_01_TAMMY_F_seg2.mp3'),
    time_night_2: require('../../assets/audio/female_f/H05_time_night_02_TAMMY_F.mp3'),
    time_night_3_seg1: require('../../assets/audio/female_f/H05_time_night_03_TAMMY_F_seg1.mp3'),
    time_night_3_seg2: require('../../assets/audio/female_f/H05_time_night_03_TAMMY_F_seg2.mp3'),
    record_distance_1_seg1: require('../../assets/audio/female_f/I01_record_distance_01_TAMMY_F_seg1.mp3'),
    record_distance_1_seg2: require('../../assets/audio/female_f/I01_record_distance_01_TAMMY_F_seg2.mp3'),
    record_distance_2_seg1: require('../../assets/audio/female_f/I01_record_distance_02_TAMMY_F_seg1.mp3'),
    record_distance_2_seg2: require('../../assets/audio/female_f/I01_record_distance_02_TAMMY_F_seg2.mp3'),
    record_distance_3_seg1: require('../../assets/audio/female_f/I01_record_distance_03_TAMMY_F_seg1.mp3'),
    record_distance_3_seg2: require('../../assets/audio/female_f/I01_record_distance_03_TAMMY_F_seg2.mp3'),
    record_speed_1_seg1: require('../../assets/audio/female_f/I02_record_speed_01_TAMMY_F_seg1.mp3'),
    record_speed_1_seg2: require('../../assets/audio/female_f/I02_record_speed_01_TAMMY_F_seg2.mp3'),
    record_speed_2_seg1: require('../../assets/audio/female_f/I02_record_speed_02_TAMMY_F_seg1.mp3'),
    record_speed_2_seg2: require('../../assets/audio/female_f/I02_record_speed_02_TAMMY_F_seg2.mp3'),
    record_speed_3_seg1: require('../../assets/audio/female_f/I02_record_speed_03_TAMMY_F_seg1.mp3'),
    record_speed_3_seg2: require('../../assets/audio/female_f/I02_record_speed_03_TAMMY_F_seg2.mp3'),
    record_steps_1_seg1: require('../../assets/audio/female_f/I03_record_steps_01_TAMMY_F_seg1.mp3'),
    record_steps_1_seg2: require('../../assets/audio/female_f/I03_record_steps_01_TAMMY_F_seg2.mp3'),
    record_steps_2_seg1: require('../../assets/audio/female_f/I03_record_steps_02_TAMMY_F_seg1.mp3'),
    record_steps_2_seg2: require('../../assets/audio/female_f/I03_record_steps_02_TAMMY_F_seg2.mp3'),
    record_steps_3_seg1: require('../../assets/audio/female_f/I03_record_steps_03_TAMMY_F_seg1.mp3'),
    record_steps_3_seg2: require('../../assets/audio/female_f/I03_record_steps_03_TAMMY_F_seg2.mp3'),
    record_duration_1_seg1: require('../../assets/audio/female_f/I04_record_duration_01_TAMMY_F_seg1.mp3'),
    record_duration_1_seg2: require('../../assets/audio/female_f/I04_record_duration_01_TAMMY_F_seg2.mp3'),
    record_duration_2_seg1: require('../../assets/audio/female_f/I04_record_duration_02_TAMMY_F_seg1.mp3'),
    record_duration_2_seg2: require('../../assets/audio/female_f/I04_record_duration_02_TAMMY_F_seg2.mp3'),
    record_duration_3_seg1: require('../../assets/audio/female_f/I04_record_duration_03_TAMMY_F_seg1.mp3'),
    record_duration_3_seg2: require('../../assets/audio/female_f/I04_record_duration_03_TAMMY_F_seg2.mp3'),
    streak_3_1_seg1: require('../../assets/audio/female_f/L01_streak_3_01_TAMMY_F_seg1.mp3'),
    streak_3_1_seg2: require('../../assets/audio/female_f/L01_streak_3_01_TAMMY_F_seg2.mp3'),
    streak_3_2_seg1: require('../../assets/audio/female_f/L01_streak_3_02_TAMMY_F_seg1.mp3'),
    streak_3_2_seg2: require('../../assets/audio/female_f/L01_streak_3_02_TAMMY_F_seg2.mp3'),
    streak_3_3_seg1: require('../../assets/audio/female_f/L01_streak_3_03_TAMMY_F_seg1.mp3'),
    streak_3_3_seg2: require('../../assets/audio/female_f/L01_streak_3_03_TAMMY_F_seg2.mp3'),
    streak_14_1_seg1: require('../../assets/audio/female_f/L02_streak_14_01_TAMMY_F_seg1.mp3'),
    streak_14_1_seg2: require('../../assets/audio/female_f/L02_streak_14_01_TAMMY_F_seg2.mp3'),
    streak_14_2_seg1: require('../../assets/audio/female_f/L02_streak_14_02_TAMMY_F_seg1.mp3'),
    streak_14_2_seg2: require('../../assets/audio/female_f/L02_streak_14_02_TAMMY_F_seg2.mp3'),
    streak_14_3_seg1: require('../../assets/audio/female_f/L02_streak_14_03_TAMMY_F_seg1.mp3'),
    streak_14_3_seg2: require('../../assets/audio/female_f/L02_streak_14_03_TAMMY_F_seg2.mp3'),
    streak_30_1_seg1: require('../../assets/audio/female_f/L03_streak_30_01_TAMMY_F_seg1.mp3'),
    streak_30_1_seg2: require('../../assets/audio/female_f/L03_streak_30_01_TAMMY_F_seg2.mp3'),
    streak_30_2_seg1: require('../../assets/audio/female_f/L03_streak_30_02_TAMMY_F_seg1.mp3'),
    streak_30_2_seg2: require('../../assets/audio/female_f/L03_streak_30_02_TAMMY_F_seg2.mp3'),
    streak_30_3_seg1: require('../../assets/audio/female_f/L03_streak_30_03_TAMMY_F_seg1.mp3'),
    streak_30_3_seg2: require('../../assets/audio/female_f/L03_streak_30_03_TAMMY_F_seg2.mp3'),
    comeback_short_1_seg1: require('../../assets/audio/female_f/L04_comeback_short_01_TAMMY_F_seg1.mp3'),
    comeback_short_1_seg2: require('../../assets/audio/female_f/L04_comeback_short_01_TAMMY_F_seg2.mp3'),
    comeback_short_2: require('../../assets/audio/female_f/L04_comeback_short_02_TAMMY_F.mp3'),
    comeback_short_3_seg1: require('../../assets/audio/female_f/L04_comeback_short_03_TAMMY_F_seg1.mp3'),
    comeback_short_3_seg2: require('../../assets/audio/female_f/L04_comeback_short_03_TAMMY_F_seg2.mp3'),
    comeback_long_1_seg1: require('../../assets/audio/female_f/L05_comeback_long_01_TAMMY_F_seg1.mp3'),
    comeback_long_1_seg2: require('../../assets/audio/female_f/L05_comeback_long_01_TAMMY_F_seg2.mp3'),
    comeback_long_2: require('../../assets/audio/female_f/L05_comeback_long_02_TAMMY_F.mp3'),
    comeback_long_3_seg1: require('../../assets/audio/female_f/L05_comeback_long_03_TAMMY_F_seg1.mp3'),
    comeback_long_3_seg2: require('../../assets/audio/female_f/L05_comeback_long_03_TAMMY_F_seg2.mp3'),
    science_cal_1_seg1: require('../../assets/audio/female_f/N01_science_cal_01_TAMMY_F_seg1.mp3'),
    science_cal_1_seg2: require('../../assets/audio/female_f/N01_science_cal_01_TAMMY_F_seg2.mp3'),
    science_cal_2: require('../../assets/audio/female_f/N01_science_cal_02_TAMMY_F.mp3'),
    science_cal_3: require('../../assets/audio/female_f/N01_science_cal_03_TAMMY_F.mp3'),
    science_heart_1_seg1: require('../../assets/audio/female_f/N02_science_heart_01_TAMMY_F_seg1.mp3'),
    science_heart_2: require('../../assets/audio/female_f/N02_science_heart_02_TAMMY_F.mp3'),
    science_heart_3: require('../../assets/audio/female_f/N02_science_heart_03_TAMMY_F.mp3'),
    science_metab_1: require('../../assets/audio/female_f/N03_science_metab_01_TAMMY_F.mp3'),
    science_metab_2: require('../../assets/audio/female_f/N03_science_metab_02_TAMMY_F.mp3'),
    science_metab_3_seg1: require('../../assets/audio/female_f/N03_science_metab_03_TAMMY_F_seg1.mp3'),
    science_sleep_1_seg1: require('../../assets/audio/female_f/N04_science_sleep_01_TAMMY_F_seg1.mp3'),
    science_sleep_1_seg2: require('../../assets/audio/female_f/N04_science_sleep_01_TAMMY_F_seg2.mp3'),
    science_sleep_2: require('../../assets/audio/female_f/N04_science_sleep_02_TAMMY_F.mp3'),
    science_sleep_3_seg1: require('../../assets/audio/female_f/N04_science_sleep_03_TAMMY_F_seg1.mp3'),
    science_sleep_3_seg2: require('../../assets/audio/female_f/N04_science_sleep_03_TAMMY_F_seg2.mp3'),
    science_mood_1: require('../../assets/audio/female_f/N05_science_mood_01_TAMMY_F.mp3'),
    science_mood_2_seg1: require('../../assets/audio/female_f/N05_science_mood_02_TAMMY_F_seg1.mp3'),
    science_mood_2_seg2: require('../../assets/audio/female_f/N05_science_mood_02_TAMMY_F_seg2.mp3'),
    science_mood_3: require('../../assets/audio/female_f/N05_science_mood_03_TAMMY_F.mp3'),
    science_body_1: require('../../assets/audio/female_f/N06_science_posture_01_TAMMY_F.mp3'),
    science_body_2_seg1: require('../../assets/audio/female_f/N06_science_posture_02_TAMMY_F_seg1.mp3'),
    science_body_2_seg2: require('../../assets/audio/female_f/N06_science_posture_02_TAMMY_F_seg2.mp3'),
    science_body_3: require('../../assets/audio/female_f/N06_science_posture_03_TAMMY_F.mp3'),
    uphill_1_seg1: require('../../assets/audio/female_f/O02_motivation_uphill_01_TAMMY_F_seg1.mp3'),
    uphill_1_seg2: require('../../assets/audio/female_f/O02_motivation_uphill_01_TAMMY_F_seg2.mp3'),
    uphill_2_seg1: require('../../assets/audio/female_f/O02_motivation_uphill_02_TAMMY_F_seg1.mp3'),
    uphill_2_seg2: require('../../assets/audio/female_f/O02_motivation_uphill_02_TAMMY_F_seg2.mp3'),
    uphill_3_seg1: require('../../assets/audio/female_f/O02_motivation_uphill_03_TAMMY_F_seg1.mp3'),
    uphill_3_seg2: require('../../assets/audio/female_f/O02_motivation_uphill_03_TAMMY_F_seg2.mp3'),
    milestone_1km_1_seg1: require('../../assets/audio/female_f/A01_milestone_1km_01_TAMMY_F_seg1.mp3'),
    milestone_1km_1_seg2: require('../../assets/audio/female_f/A01_milestone_1km_01_TAMMY_F_seg2.mp3'),
    milestone_1km_2_seg1: require('../../assets/audio/female_f/A01_milestone_1km_02_TAMMY_F_seg1.mp3'),
    milestone_1km_2_seg2: require('../../assets/audio/female_f/A01_milestone_1km_02_TAMMY_F_seg2.mp3'),
    milestone_1km_3_seg1: require('../../assets/audio/female_f/A01_milestone_1km_03_TAMMY_F_seg1.mp3'),
    milestone_1km_3_seg2: require('../../assets/audio/female_f/A01_milestone_1km_03_TAMMY_F_seg2.mp3'),
    milestone_2km_1_seg1: require('../../assets/audio/female_f/A02_milestone_2km_01_TAMMY_F_seg1.mp3'),
    milestone_2km_1_seg2: require('../../assets/audio/female_f/A02_milestone_2km_01_TAMMY_F_seg2.mp3'),
    milestone_2km_2_seg1: require('../../assets/audio/female_f/A02_milestone_2km_02_TAMMY_F_seg1.mp3'),
    milestone_2km_2_seg2: require('../../assets/audio/female_f/A02_milestone_2km_02_TAMMY_F_seg2.mp3'),
    milestone_2km_3_seg1: require('../../assets/audio/female_f/A02_milestone_2km_03_TAMMY_F_seg1.mp3'),
    milestone_2km_3_seg2: require('../../assets/audio/female_f/A02_milestone_2km_03_TAMMY_F_seg2.mp3'),
    milestone_3km_1_seg1: require('../../assets/audio/female_f/A03_milestone_3km_01_TAMMY_F_seg1.mp3'),
    milestone_3km_1_seg2: require('../../assets/audio/female_f/A03_milestone_3km_01_TAMMY_F_seg2.mp3'),
    milestone_3km_2_seg1: require('../../assets/audio/female_f/A03_milestone_3km_02_TAMMY_F_seg1.mp3'),
    milestone_3km_2_seg2: require('../../assets/audio/female_f/A03_milestone_3km_02_TAMMY_F_seg2.mp3'),
    milestone_3km_3_seg1: require('../../assets/audio/female_f/A03_milestone_3km_03_TAMMY_F_seg1.mp3'),
    milestone_3km_3_seg2: require('../../assets/audio/female_f/A03_milestone_3km_03_TAMMY_F_seg2.mp3'),
    milestone_4km_1_seg1: require('../../assets/audio/female_f/A04_milestone_4km_01_TAMMY_F_seg1.mp3'),
    milestone_4km_1_seg2: require('../../assets/audio/female_f/A04_milestone_4km_01_TAMMY_F_seg2.mp3'),
    milestone_4km_2_seg1: require('../../assets/audio/female_f/A04_milestone_4km_02_TAMMY_F_seg1.mp3'),
    milestone_4km_2_seg2: require('../../assets/audio/female_f/A04_milestone_4km_02_TAMMY_F_seg2.mp3'),
    milestone_4km_3_seg1: require('../../assets/audio/female_f/A04_milestone_4km_03_TAMMY_F_seg1.mp3'),
    milestone_4km_3_seg2: require('../../assets/audio/female_f/A04_milestone_4km_03_TAMMY_F_seg2.mp3'),
    milestone_5km_1_seg1: require('../../assets/audio/female_f/A05_milestone_5km_01_TAMMY_F_seg1.mp3'),
    milestone_5km_1_seg2: require('../../assets/audio/female_f/A05_milestone_5km_01_TAMMY_F_seg2.mp3'),
    milestone_5km_2_seg1: require('../../assets/audio/female_f/A05_milestone_5km_02_TAMMY_F_seg1.mp3'),
    milestone_5km_2_seg2: require('../../assets/audio/female_f/A05_milestone_5km_02_TAMMY_F_seg2.mp3'),
    milestone_5km_3_seg1: require('../../assets/audio/female_f/A05_milestone_5km_03_TAMMY_F_seg1.mp3'),
    milestone_5km_3_seg2: require('../../assets/audio/female_f/A05_milestone_5km_03_TAMMY_F_seg2.mp3'),
    quarter_done_1_seg1: require('../../assets/audio/female_f/B01_quarter_done_01_TAMMY_F_seg1.mp3'),
    quarter_done_1_seg2: require('../../assets/audio/female_f/B01_quarter_done_01_TAMMY_F_seg2.mp3'),
    quarter_done_2_seg1: require('../../assets/audio/female_f/B01_quarter_done_02_TAMMY_F_seg1.mp3'),
    quarter_done_2_seg2: require('../../assets/audio/female_f/B01_quarter_done_02_TAMMY_F_seg2.mp3'),
    quarter_done_3_seg1: require('../../assets/audio/female_f/B01_quarter_done_03_TAMMY_F_seg1.mp3'),
    quarter_done_3_seg2: require('../../assets/audio/female_f/B01_quarter_done_03_TAMMY_F_seg2.mp3'),
    halfway_1_seg1: require('../../assets/audio/female_f/B02_halfway_01_TAMMY_F_seg1.mp3'),
    halfway_1_seg2: require('../../assets/audio/female_f/B02_halfway_01_TAMMY_F_seg2.mp3'),
    halfway_2_seg1: require('../../assets/audio/female_f/B02_halfway_02_TAMMY_F_seg1.mp3'),
    halfway_2_seg2: require('../../assets/audio/female_f/B02_halfway_02_TAMMY_F_seg2.mp3'),
    halfway_3_seg1: require('../../assets/audio/female_f/B02_halfway_03_TAMMY_F_seg1.mp3'),
    halfway_3_seg2: require('../../assets/audio/female_f/B02_halfway_03_TAMMY_F_seg2.mp3'),
    halfway_4_seg1: require('../../assets/audio/female_f/B02_halfway_04_TAMMY_F_seg1.mp3'),
    halfway_4_seg2: require('../../assets/audio/female_f/B02_halfway_04_TAMMY_F_seg2.mp3'),
    three_quarters_1_seg1: require('../../assets/audio/female_f/B03_three_quarters_01_TAMMY_F_seg1.mp3'),
    three_quarters_1_seg2: require('../../assets/audio/female_f/B03_three_quarters_01_TAMMY_F_seg2.mp3'),
    three_quarters_2_seg1: require('../../assets/audio/female_f/B03_three_quarters_02_TAMMY_F_seg1.mp3'),
    three_quarters_2_seg2: require('../../assets/audio/female_f/B03_three_quarters_02_TAMMY_F_seg2.mp3'),
    three_quarters_3_seg1: require('../../assets/audio/female_f/B03_three_quarters_03_TAMMY_F_seg1.mp3'),
    three_quarters_3_seg2: require('../../assets/audio/female_f/B03_three_quarters_03_TAMMY_F_seg2.mp3'),
    last_min_cooldown_1_seg1: require('../../assets/audio/female_f/B04_last_min_cooldown_01_TAMMY_F_seg1.mp3'),
    last_min_cooldown_1_seg2: require('../../assets/audio/female_f/B04_last_min_cooldown_01_TAMMY_F_seg2.mp3'),
    last_min_cooldown_2_seg1: require('../../assets/audio/female_f/B04_last_min_cooldown_02_TAMMY_F_seg1.mp3'),
    last_min_cooldown_2_seg2: require('../../assets/audio/female_f/B04_last_min_cooldown_02_TAMMY_F_seg2.mp3'),
    last_min_cooldown_3_seg1: require('../../assets/audio/female_f/B04_last_min_cooldown_03_TAMMY_F_seg1.mp3'),
    last_min_cooldown_3_seg2: require('../../assets/audio/female_f/B04_last_min_cooldown_03_TAMMY_F_seg2.mp3'),
    workout_complete_1_seg1: require('../../assets/audio/female_f/B05_workout_complete_01_TAMMY_F_seg1.mp3'),
    workout_complete_1_seg2: require('../../assets/audio/female_f/B05_workout_complete_01_TAMMY_F_seg2.mp3'),
    workout_complete_2_seg1: require('../../assets/audio/female_f/B05_workout_complete_02_TAMMY_F_seg1.mp3'),
    workout_complete_2_seg2: require('../../assets/audio/female_f/B05_workout_complete_02_TAMMY_F_seg2.mp3'),
    workout_complete_3_seg1: require('../../assets/audio/female_f/B05_workout_complete_03_TAMMY_F_seg1.mp3'),
    workout_complete_3_seg2: require('../../assets/audio/female_f/B05_workout_complete_03_TAMMY_F_seg2.mp3'),
    workout_complete_4_seg1: require('../../assets/audio/female_f/B05_workout_complete_04_TAMMY_F_seg1.mp3'),
    workout_complete_4_seg2: require('../../assets/audio/female_f/B05_workout_complete_04_TAMMY_F_seg2.mp3'),
    badge_first_workout_1_seg1: require('../../assets/audio/female_f/B06_badge_first_workout_01_TAMMY_F_seg1.mp3'),
    badge_first_workout_1_seg2: require('../../assets/audio/female_f/B06_badge_first_workout_01_TAMMY_F_seg2.mp3'),
    badge_first_workout_2_seg1: require('../../assets/audio/female_f/B06_badge_first_workout_02_TAMMY_F_seg1.mp3'),
    badge_first_workout_2_seg2: require('../../assets/audio/female_f/B06_badge_first_workout_02_TAMMY_F_seg2.mp3'),
    badge_first_workout_3_seg1: require('../../assets/audio/female_f/B06_badge_first_workout_03_TAMMY_F_seg1.mp3'),
    badge_first_workout_3_seg2: require('../../assets/audio/female_f/B06_badge_first_workout_03_TAMMY_F_seg2.mp3'),
    badge_streak_7_1_seg1: require('../../assets/audio/female_f/B07_badge_streak_7_01_TAMMY_F_seg1.mp3'),
    badge_streak_7_1_seg2: require('../../assets/audio/female_f/B07_badge_streak_7_01_TAMMY_F_seg2.mp3'),
    badge_streak_7_2_seg1: require('../../assets/audio/female_f/B07_badge_streak_7_02_TAMMY_F_seg1.mp3'),
    badge_streak_7_2_seg2: require('../../assets/audio/female_f/B07_badge_streak_7_02_TAMMY_F_seg2.mp3'),
    badge_streak_7_3_seg1: require('../../assets/audio/female_f/B07_badge_streak_7_03_TAMMY_F_seg1.mp3'),
    badge_streak_7_3_seg2: require('../../assets/audio/female_f/B07_badge_streak_7_03_TAMMY_F_seg2.mp3'),
    badge_10k_steps_1_seg1: require('../../assets/audio/female_f/B08_badge_10k_steps_01_TAMMY_F_seg1.mp3'),
    badge_10k_steps_1_seg2: require('../../assets/audio/female_f/B08_badge_10k_steps_01_TAMMY_F_seg2.mp3'),
    badge_10k_steps_2_seg1: require('../../assets/audio/female_f/B08_badge_10k_steps_02_TAMMY_F_seg1.mp3'),
    badge_10k_steps_2_seg2: require('../../assets/audio/female_f/B08_badge_10k_steps_02_TAMMY_F_seg2.mp3'),
    badge_10k_steps_3_seg1: require('../../assets/audio/female_f/B08_badge_10k_steps_03_TAMMY_F_seg1.mp3'),
    badge_10k_steps_3_seg2: require('../../assets/audio/female_f/B08_badge_10k_steps_03_TAMMY_F_seg2.mp3'),
    badge_5km_total_1_seg1: require('../../assets/audio/female_f/B09_badge_5km_total_01_TAMMY_F_seg1.mp3'),
    badge_5km_total_1_seg2: require('../../assets/audio/female_f/B09_badge_5km_total_01_TAMMY_F_seg2.mp3'),
    badge_5km_total_2_seg1: require('../../assets/audio/female_f/B09_badge_5km_total_02_TAMMY_F_seg1.mp3'),
    badge_5km_total_2_seg2: require('../../assets/audio/female_f/B09_badge_5km_total_02_TAMMY_F_seg2.mp3'),
    badge_5km_total_3_seg1: require('../../assets/audio/female_f/B09_badge_5km_total_03_TAMMY_F_seg1.mp3'),
    badge_5km_total_3_seg2: require('../../assets/audio/female_f/B09_badge_5km_total_03_TAMMY_F_seg2.mp3'),
    badge_full_week_1_seg1: require('../../assets/audio/female_f/B10_badge_full_week_01_TAMMY_F_seg1.mp3'),
    badge_full_week_1_seg2: require('../../assets/audio/female_f/B10_badge_full_week_01_TAMMY_F_seg2.mp3'),
    badge_full_week_2_seg1: require('../../assets/audio/female_f/B10_badge_full_week_02_TAMMY_F_seg1.mp3'),
    badge_full_week_2_seg2: require('../../assets/audio/female_f/B10_badge_full_week_02_TAMMY_F_seg2.mp3'),
    badge_full_week_3_seg1: require('../../assets/audio/female_f/B10_badge_full_week_03_TAMMY_F_seg1.mp3'),
    badge_full_week_3_seg2: require('../../assets/audio/female_f/B10_badge_full_week_03_TAMMY_F_seg2.mp3'),
    badge_speed_demon_1_seg1: require('../../assets/audio/female_f/B11_badge_speed_demon_01_TAMMY_F_seg1.mp3'),
    badge_speed_demon_1_seg2: require('../../assets/audio/female_f/B11_badge_speed_demon_01_TAMMY_F_seg2.mp3'),
    badge_speed_demon_2_seg1: require('../../assets/audio/female_f/B11_badge_speed_demon_02_TAMMY_F_seg1.mp3'),
    badge_speed_demon_2_seg2: require('../../assets/audio/female_f/B11_badge_speed_demon_02_TAMMY_F_seg2.mp3'),
    badge_speed_demon_3_seg1: require('../../assets/audio/female_f/B11_badge_speed_demon_03_TAMMY_F_seg1.mp3'),
    badge_speed_demon_3_seg2: require('../../assets/audio/female_f/B11_badge_speed_demon_03_TAMMY_F_seg2.mp3'),
    badge_goal_reached_1_seg1: require('../../assets/audio/female_f/B12_badge_goal_reached_01_TAMMY_F_seg1.mp3'),
    badge_goal_reached_1_seg2: require('../../assets/audio/female_f/B12_badge_goal_reached_01_TAMMY_F_seg2.mp3'),
    badge_goal_reached_2_seg1: require('../../assets/audio/female_f/B12_badge_goal_reached_02_TAMMY_F_seg1.mp3'),
    badge_goal_reached_2_seg2: require('../../assets/audio/female_f/B12_badge_goal_reached_02_TAMMY_F_seg2.mp3'),
    badge_goal_reached_3_seg1: require('../../assets/audio/female_f/B12_badge_goal_reached_03_TAMMY_F_seg1.mp3'),
    badge_goal_reached_3_seg2: require('../../assets/audio/female_f/B12_badge_goal_reached_03_TAMMY_F_seg2.mp3'),
    invalid_workout_1: require('../../assets/audio/female_f/B13_invalid_workout_01_TAMMY_F.mp3'),
    invalid_workout_2: require('../../assets/audio/female_f/B13_invalid_workout_02_TAMMY_F.mp3'),
    invalid_workout_3: require('../../assets/audio/female_f/B13_invalid_workout_03_TAMMY_F.mp3'),
    pause_1: require('../../assets/audio/female_f/B14_pause_01_TAMMY_F.mp3'),
    pause_2: require('../../assets/audio/female_f/B14_pause_02_TAMMY_F.mp3'),
    pause_3: require('../../assets/audio/female_f/B14_pause_03_TAMMY_F.mp3'),
    resume_1: require('../../assets/audio/female_f/B15_resume_01_TAMMY_F.mp3'),
    resume_2: require('../../assets/audio/female_f/B15_resume_02_TAMMY_F.mp3'),
    resume_3: require('../../assets/audio/female_f/B15_resume_03_TAMMY_F.mp3'),
    Q01_duration_01: require('../../assets/audio/female_f/Q01_duration_01_TAMMY_F.mp3'),
    Q01_duration_02: require('../../assets/audio/female_f/Q01_duration_02_TAMMY_F.mp3'),
    Q01_duration_03: require('../../assets/audio/female_f/Q01_duration_03_TAMMY_F.mp3'),
    Q01_duration_04: require('../../assets/audio/female_f/Q01_duration_04_TAMMY_F.mp3'),
    Q01_duration_05: require('../../assets/audio/female_f/Q01_duration_05_TAMMY_F.mp3'),
    Q01_duration_06: require('../../assets/audio/female_f/Q01_duration_06_TAMMY_F.mp3'),
    Q01_duration_07: require('../../assets/audio/female_f/Q01_duration_07_TAMMY_F.mp3'),
    Q01_duration_08: require('../../assets/audio/female_f/Q01_duration_08_TAMMY_F.mp3'),
    Q01_duration_09: require('../../assets/audio/female_f/Q01_duration_09_TAMMY_F.mp3'),
    Q01_duration_10: require('../../assets/audio/female_f/Q01_duration_10_TAMMY_F.mp3'),
    Q01_duration_11: require('../../assets/audio/female_f/Q01_duration_11_TAMMY_F.mp3'),
    Q01_duration_12: require('../../assets/audio/female_f/Q01_duration_12_TAMMY_F.mp3'),
    Q01_duration_13: require('../../assets/audio/female_f/Q01_duration_13_TAMMY_F.mp3'),
    Q01_duration_14: require('../../assets/audio/female_f/Q01_duration_14_TAMMY_F.mp3'),
    Q01_duration_15: require('../../assets/audio/female_f/Q01_duration_15_TAMMY_F.mp3'),
    warmup_announce_01_seg1: require('../../assets/audio/female_f/Q02_warmup_announce_01_TAMMY_F_seg1.mp3'),
    warmup_announce_01_seg2: require('../../assets/audio/female_f/Q02_warmup_announce_01_TAMMY_F_seg2.mp3'),
    warmup_announce_02_seg1: require('../../assets/audio/female_f/Q02_warmup_announce_02_TAMMY_F_seg1.mp3'),
    warmup_announce_02_seg2: require('../../assets/audio/female_f/Q02_warmup_announce_02_TAMMY_F_seg2.mp3'),
    warmup_announce_03_seg1: require('../../assets/audio/female_f/Q02_warmup_announce_03_TAMMY_F_seg1.mp3'),
    warmup_announce_03_seg2: require('../../assets/audio/female_f/Q02_warmup_announce_03_TAMMY_F_seg2.mp3'),
    moderate_announce_01_seg1: require('../../assets/audio/female_f/Q03_moderate_announce_01_TAMMY_F_seg1.mp3'),
    moderate_announce_01_seg2: require('../../assets/audio/female_f/Q03_moderate_announce_01_TAMMY_F_seg2.mp3'),
    moderate_announce_02_seg1: require('../../assets/audio/female_f/Q03_moderate_announce_02_TAMMY_F_seg1.mp3'),
    moderate_announce_02_seg2: require('../../assets/audio/female_f/Q03_moderate_announce_02_TAMMY_F_seg2.mp3'),
    moderate_announce_03_seg1: require('../../assets/audio/female_f/Q03_moderate_announce_03_TAMMY_F_seg1.mp3'),
    moderate_announce_03_seg2: require('../../assets/audio/female_f/Q03_moderate_announce_03_TAMMY_F_seg2.mp3'),
    fast_announce_01_seg1: require('../../assets/audio/female_f/Q04_fast_announce_01_TAMMY_F_seg1.mp3'),
    fast_announce_01_seg2: require('../../assets/audio/female_f/Q04_fast_announce_01_TAMMY_F_seg2.mp3'),
    fast_announce_02_seg1: require('../../assets/audio/female_f/Q04_fast_announce_02_TAMMY_F_seg1.mp3'),
    fast_announce_02_seg2: require('../../assets/audio/female_f/Q04_fast_announce_02_TAMMY_F_seg2.mp3'),
    fast_announce_03_seg1: require('../../assets/audio/female_f/Q04_fast_announce_03_TAMMY_F_seg1.mp3'),
    fast_announce_03_seg2: require('../../assets/audio/female_f/Q04_fast_announce_03_TAMMY_F_seg2.mp3'),
    fast_announce_04_seg1: require('../../assets/audio/female_f/Q04_fast_announce_04_TAMMY_F_seg1.mp3'),
    fast_announce_04_seg2: require('../../assets/audio/female_f/Q04_fast_announce_04_TAMMY_F_seg2.mp3'),
    cooldown_announce_01_seg1: require('../../assets/audio/female_f/Q05_cooldown_announce_01_TAMMY_F_seg1.mp3'),
    cooldown_announce_01_seg2: require('../../assets/audio/female_f/Q05_cooldown_announce_01_TAMMY_F_seg2.mp3'),
    cooldown_announce_02_seg1: require('../../assets/audio/female_f/Q05_cooldown_announce_02_TAMMY_F_seg1.mp3'),
    cooldown_announce_02_seg2: require('../../assets/audio/female_f/Q05_cooldown_announce_02_TAMMY_F_seg2.mp3'),
    cooldown_announce_03_seg1: require('../../assets/audio/female_f/Q05_cooldown_announce_03_TAMMY_F_seg1.mp3'),
    cooldown_announce_03_seg2: require('../../assets/audio/female_f/Q05_cooldown_announce_03_TAMMY_F_seg2.mp3'),
  },
  male_m: {
    workout_start_1_seg1: require('../../assets/audio/male_m/D01_warmup_start_01_MATTEO_M_seg1.mp3'),
    workout_start_1_seg2: require('../../assets/audio/male_m/D01_warmup_start_01_MATTEO_M_seg2.mp3'),
    workout_start_2_seg1: require('../../assets/audio/male_m/D01_warmup_start_02_MATTEO_M_seg1.mp3'),
    workout_start_2_seg2: require('../../assets/audio/male_m/D01_warmup_start_02_MATTEO_M_seg2.mp3'),
    workout_start_3_seg1: require('../../assets/audio/male_m/D01_warmup_start_03_MATTEO_M_seg1.mp3'),
    workout_start_3_seg2: require('../../assets/audio/male_m/D01_warmup_start_03_MATTEO_M_seg2.mp3'),
    interval_moderate_1_seg1: require('../../assets/audio/male_m/D03_phase_moderate_01_MATTEO_M_seg1.mp3'),
    interval_moderate_1_seg2: require('../../assets/audio/male_m/D03_phase_moderate_01_MATTEO_M_seg2.mp3'),
    interval_moderate_2_seg1: require('../../assets/audio/male_m/D03_phase_moderate_02_MATTEO_M_seg1.mp3'),
    interval_moderate_2_seg2: require('../../assets/audio/male_m/D03_phase_moderate_02_MATTEO_M_seg2.mp3'),
    interval_moderate_3_seg1: require('../../assets/audio/male_m/D03_phase_moderate_03_MATTEO_M_seg1.mp3'),
    interval_fast_1_seg1: require('../../assets/audio/male_m/D04_phase_sustained_01_MATTEO_M_seg1.mp3'),
    interval_fast_1_seg2: require('../../assets/audio/male_m/D04_phase_sustained_01_MATTEO_M_seg2.mp3'),
    interval_fast_2_seg1: require('../../assets/audio/male_m/D04_phase_sustained_02_MATTEO_M_seg1.mp3'),
    interval_fast_2_seg2: require('../../assets/audio/male_m/D04_phase_sustained_02_MATTEO_M_seg2.mp3'),
    interval_fast_3_seg1: require('../../assets/audio/male_m/D04_phase_sustained_03_MATTEO_M_seg1.mp3'),
    interval_fast_3_seg2: require('../../assets/audio/male_m/D04_phase_sustained_03_MATTEO_M_seg2.mp3'),
    interval_fast_4_seg1: require('../../assets/audio/male_m/D04_phase_sustained_04_MATTEO_M_seg1.mp3'),
    interval_fast_4_seg2: require('../../assets/audio/male_m/D04_phase_sustained_04_MATTEO_M_seg2.mp3'),
    cooldown_1_seg1: require('../../assets/audio/male_m/D05_phase_recovery_01_MATTEO_M_seg1.mp3'),
    cooldown_1_seg2: require('../../assets/audio/male_m/D05_phase_recovery_01_MATTEO_M_seg2.mp3'),
    cooldown_2_seg1: require('../../assets/audio/male_m/D05_phase_recovery_02_MATTEO_M_seg1.mp3'),
    cooldown_2_seg2: require('../../assets/audio/male_m/D05_phase_recovery_02_MATTEO_M_seg2.mp3'),
    cooldown_3_seg1: require('../../assets/audio/male_m/D05_phase_recovery_03_MATTEO_M_seg1.mp3'),
    cooldown_3_seg2: require('../../assets/audio/male_m/D05_phase_recovery_03_MATTEO_M_seg2.mp3'),
    motivation_random_1_seg1: require('../../assets/audio/male_m/O01_motivation_push_01_MATTEO_M_seg1.mp3'),
    motivation_random_1_seg2: require('../../assets/audio/male_m/O01_motivation_push_01_MATTEO_M_seg2.mp3'),
    motivation_random_2: require('../../assets/audio/male_m/O01_motivation_push_02_MATTEO_M.mp3'),
    motivation_random_3: require('../../assets/audio/male_m/O01_motivation_push_03_MATTEO_M.mp3'),
    motivation_random_4_seg1: require('../../assets/audio/male_m/O01_motivation_push_04_MATTEO_M_seg1.mp3'),
    motivation_random_4_seg2: require('../../assets/audio/male_m/O01_motivation_push_04_MATTEO_M_seg2.mp3'),
    last_minute_1: require('../../assets/audio/male_m/O03_final_push_01_MATTEO_M.mp3'),
    last_minute_2: require('../../assets/audio/male_m/O03_final_push_02_MATTEO_M.mp3'),
    last_minute_3: require('../../assets/audio/male_m/O03_final_push_03_MATTEO_M.mp3'),
    last_minute_4: require('../../assets/audio/male_m/O03_final_push_04_MATTEO_M.mp3'),
    last_30_seconds_1: require('../../assets/audio/male_m/O03_final_push_05_MATTEO_M.mp3'),
    last_30_seconds_2: require('../../assets/audio/male_m/O03_final_push_06_MATTEO_M.mp3'),
    last_30_seconds_3: require('../../assets/audio/male_m/O03_final_push_07_MATTEO_M.mp3'),
    badge_rain_walker_1: require('../../assets/audio/male_m/C01_rain_walker_01_MATTEO_M.mp3'),
    badge_rain_walker_2_seg1: require('../../assets/audio/male_m/C01_rain_walker_02_MATTEO_M_seg1.mp3'),
    badge_rain_walker_2_seg2: require('../../assets/audio/male_m/C01_rain_walker_02_MATTEO_M_seg2.mp3'),
    badge_rain_walker_3_seg1: require('../../assets/audio/male_m/C01_rain_walker_03_MATTEO_M_seg1.mp3'),
    badge_rain_walker_3_seg2: require('../../assets/audio/male_m/C01_rain_walker_03_MATTEO_M_seg2.mp3'),
    badge_ice_walker_1_seg1: require('../../assets/audio/male_m/C02_ice_walker_01_MATTEO_M_seg1.mp3'),
    badge_ice_walker_2: require('../../assets/audio/male_m/C02_ice_walker_02_MATTEO_M.mp3'),
    badge_ice_walker_3_seg1: require('../../assets/audio/male_m/C02_ice_walker_03_MATTEO_M_seg1.mp3'),
    badge_ice_walker_3_seg2: require('../../assets/audio/male_m/C02_ice_walker_03_MATTEO_M_seg2.mp3'),
    badge_heat_warrior_1: require('../../assets/audio/male_m/C03_heat_warrior_01_MATTEO_M.mp3'),
    badge_heat_warrior_2_seg1: require('../../assets/audio/male_m/C03_heat_warrior_02_MATTEO_M_seg1.mp3'),
    badge_heat_warrior_2_seg2: require('../../assets/audio/male_m/C03_heat_warrior_02_MATTEO_M_seg2.mp3'),
    badge_heat_warrior_3_seg1: require('../../assets/audio/male_m/C03_heat_warrior_03_MATTEO_M_seg1.mp3'),
    badge_heat_warrior_3_seg2: require('../../assets/audio/male_m/C03_heat_warrior_03_MATTEO_M_seg2.mp3'),
    badge_wind_rider_1: require('../../assets/audio/male_m/C04_wind_rider_01_MATTEO_M.mp3'),
    badge_wind_rider_2_seg1: require('../../assets/audio/male_m/C04_wind_rider_02_MATTEO_M_seg1.mp3'),
    badge_wind_rider_2_seg2: require('../../assets/audio/male_m/C04_wind_rider_02_MATTEO_M_seg2.mp3'),
    badge_wind_rider_3_seg1: require('../../assets/audio/male_m/C04_wind_rider_03_MATTEO_M_seg1.mp3'),
    badge_wind_rider_3_seg2: require('../../assets/audio/male_m/C04_wind_rider_03_MATTEO_M_seg2.mp3'),
    badge_early_bird_1: require('../../assets/audio/male_m/C05_early_bird_01_MATTEO_M.mp3'),
    badge_early_bird_2_seg1: require('../../assets/audio/male_m/C05_early_bird_02_MATTEO_M_seg1.mp3'),
    badge_early_bird_2_seg2: require('../../assets/audio/male_m/C05_early_bird_02_MATTEO_M_seg2.mp3'),
    badge_early_bird_3_seg1: require('../../assets/audio/male_m/C05_early_bird_03_MATTEO_M_seg1.mp3'),
    badge_early_bird_3_seg2: require('../../assets/audio/male_m/C05_early_bird_03_MATTEO_M_seg2.mp3'),
    badge_night_owl_1: require('../../assets/audio/male_m/C06_night_owl_01_MATTEO_M.mp3'),
    badge_night_owl_2_seg1: require('../../assets/audio/male_m/C06_night_owl_02_MATTEO_M_seg1.mp3'),
    badge_night_owl_2_seg2: require('../../assets/audio/male_m/C06_night_owl_02_MATTEO_M_seg2.mp3'),
    badge_night_owl_3: require('../../assets/audio/male_m/C06_night_owl_03_MATTEO_M.mp3'),
    badge_all_weather_1: require('../../assets/audio/male_m/C07_all_weather_01_MATTEO_M.mp3'),
    badge_all_weather_2_seg1: require('../../assets/audio/male_m/C07_all_weather_02_MATTEO_M_seg1.mp3'),
    badge_all_weather_2_seg2: require('../../assets/audio/male_m/C07_all_weather_02_MATTEO_M_seg2.mp3'),
    badge_all_weather_3_seg1: require('../../assets/audio/male_m/C07_all_weather_03_MATTEO_M_seg1.mp3'),
    badge_all_weather_3_seg2: require('../../assets/audio/male_m/C07_all_weather_03_MATTEO_M_seg2.mp3'),
    badge_unstoppable_1: require('../../assets/audio/male_m/C08_unstoppable_01_MATTEO_M.mp3'),
    badge_unstoppable_2_seg1: require('../../assets/audio/male_m/C08_unstoppable_02_MATTEO_M_seg1.mp3'),
    badge_unstoppable_2_seg2: require('../../assets/audio/male_m/C08_unstoppable_02_MATTEO_M_seg2.mp3'),
    badge_unstoppable_3_seg1: require('../../assets/audio/male_m/C08_unstoppable_03_MATTEO_M_seg1.mp3'),
    badge_unstoppable_3_seg2: require('../../assets/audio/male_m/C08_unstoppable_03_MATTEO_M_seg2.mp3'),
    badge_dawn_patrol_1: require('../../assets/audio/male_m/C09_dawn_patrol_01_MATTEO_M.mp3'),
    badge_dawn_patrol_2_seg1: require('../../assets/audio/male_m/C09_dawn_patrol_02_MATTEO_M_seg1.mp3'),
    badge_dawn_patrol_2_seg2: require('../../assets/audio/male_m/C09_dawn_patrol_02_MATTEO_M_seg2.mp3'),
    badge_dawn_patrol_3_seg1: require('../../assets/audio/male_m/C09_dawn_patrol_03_MATTEO_M_seg1.mp3'),
    badge_dawn_patrol_3_seg2: require('../../assets/audio/male_m/C09_dawn_patrol_03_MATTEO_M_seg2.mp3'),
    badge_sunset_lover_1: require('../../assets/audio/male_m/C10_sunset_lover_01_MATTEO_M.mp3'),
    badge_sunset_lover_2_seg1: require('../../assets/audio/male_m/C10_sunset_lover_02_MATTEO_M_seg1.mp3'),
    badge_sunset_lover_2_seg2: require('../../assets/audio/male_m/C10_sunset_lover_02_MATTEO_M_seg2.mp3'),
    badge_sunset_lover_3_seg1: require('../../assets/audio/male_m/C10_sunset_lover_03_MATTEO_M_seg1.mp3'),
    badge_sunset_lover_3_seg2: require('../../assets/audio/male_m/C10_sunset_lover_03_MATTEO_M_seg2.mp3'),
    badge_lunch_hero_1: require('../../assets/audio/male_m/C11_lunch_hero_01_MATTEO_M.mp3'),
    badge_lunch_hero_2_seg1: require('../../assets/audio/male_m/C11_lunch_hero_02_MATTEO_M_seg1.mp3'),
    badge_lunch_hero_2_seg2: require('../../assets/audio/male_m/C11_lunch_hero_02_MATTEO_M_seg2.mp3'),
    badge_lunch_hero_3_seg1: require('../../assets/audio/male_m/C11_lunch_hero_03_MATTEO_M_seg1.mp3'),
    badge_lunch_hero_3_seg2: require('../../assets/audio/male_m/C11_lunch_hero_03_MATTEO_M_seg2.mp3'),
    badge_four_seasons_1: require('../../assets/audio/male_m/C12_four_seasons_01_MATTEO_M.mp3'),
    badge_four_seasons_2_seg1: require('../../assets/audio/male_m/C12_four_seasons_02_MATTEO_M_seg1.mp3'),
    badge_four_seasons_2_seg2: require('../../assets/audio/male_m/C12_four_seasons_02_MATTEO_M_seg2.mp3'),
    badge_four_seasons_3_seg1: require('../../assets/audio/male_m/C12_four_seasons_03_MATTEO_M_seg1.mp3'),
    badge_four_seasons_3_seg2: require('../../assets/audio/male_m/C12_four_seasons_03_MATTEO_M_seg2.mp3'),
    body_hydration_1_seg1: require('../../assets/audio/male_m/E01_hydration_01_MATTEO_M_seg1.mp3'),
    body_hydration_1_seg2: require('../../assets/audio/male_m/E01_hydration_01_MATTEO_M_seg2.mp3'),
    body_hydration_2_seg1: require('../../assets/audio/male_m/E01_hydration_02_MATTEO_M_seg1.mp3'),
    body_hydration_2_seg2: require('../../assets/audio/male_m/E01_hydration_02_MATTEO_M_seg2.mp3'),
    body_hydration_3_seg1: require('../../assets/audio/male_m/E01_hydration_03_MATTEO_M_seg1.mp3'),
    body_hydration_3_seg2: require('../../assets/audio/male_m/E01_hydration_03_MATTEO_M_seg2.mp3'),
    body_hydration_4_seg1: require('../../assets/audio/male_m/E01_hydration_04_MATTEO_M_seg1.mp3'),
    body_hydration_4_seg2: require('../../assets/audio/male_m/E01_hydration_04_MATTEO_M_seg2.mp3'),
    body_posture_1_seg1: require('../../assets/audio/male_m/E02_posture_01_MATTEO_M_seg1.mp3'),
    body_posture_1_seg2: require('../../assets/audio/male_m/E02_posture_01_MATTEO_M_seg2.mp3'),
    body_posture_2: require('../../assets/audio/male_m/E02_posture_02_MATTEO_M.mp3'),
    body_posture_3: require('../../assets/audio/male_m/E02_posture_03_MATTEO_M.mp3'),
    body_posture_4_seg1: require('../../assets/audio/male_m/E02_posture_04_MATTEO_M_seg1.mp3'),
    body_posture_4_seg2: require('../../assets/audio/male_m/E02_posture_04_MATTEO_M_seg2.mp3'),
    body_breathing_1: require('../../assets/audio/male_m/E03_breathing_01_MATTEO_M.mp3'),
    body_breathing_2: require('../../assets/audio/male_m/E03_breathing_02_MATTEO_M.mp3'),
    body_breathing_3: require('../../assets/audio/male_m/E03_breathing_03_MATTEO_M.mp3'),
    body_breathing_4: require('../../assets/audio/male_m/E03_breathing_04_MATTEO_M.mp3'),
    body_cadence_1: require('../../assets/audio/male_m/E04_cadence_01_MATTEO_M.mp3'),
    body_cadence_2: require('../../assets/audio/male_m/E04_cadence_02_MATTEO_M.mp3'),
    body_cadence_3: require('../../assets/audio/male_m/E04_cadence_03_MATTEO_M.mp3'),
    speed_fast_1: require('../../assets/audio/male_m/F01_speed_fast_01_MATTEO_M.mp3'),
    speed_fast_2_seg1: require('../../assets/audio/male_m/F01_speed_fast_02_MATTEO_M_seg1.mp3'),
    speed_fast_2_seg2: require('../../assets/audio/male_m/F01_speed_fast_02_MATTEO_M_seg2.mp3'),
    speed_fast_3: require('../../assets/audio/male_m/F01_speed_fast_03_MATTEO_M.mp3'),
    speed_too_slow_1: require('../../assets/audio/male_m/F02_speed_slow_01_MATTEO_M.mp3'),
    speed_too_slow_2: require('../../assets/audio/male_m/F02_speed_slow_02_MATTEO_M.mp3'),
    speed_too_slow_3_seg1: require('../../assets/audio/male_m/F02_speed_slow_03_MATTEO_M_seg1.mp3'),
    speed_too_slow_3_seg2: require('../../assets/audio/male_m/F02_speed_slow_03_MATTEO_M_seg2.mp3'),
    speed_good_1_seg1: require('../../assets/audio/male_m/F03_speed_perfect_01_MATTEO_M_seg1.mp3'),
    speed_good_1_seg2: require('../../assets/audio/male_m/F03_speed_perfect_01_MATTEO_M_seg2.mp3'),
    speed_good_2_seg1: require('../../assets/audio/male_m/F03_speed_perfect_02_MATTEO_M_seg1.mp3'),
    speed_good_2_seg2: require('../../assets/audio/male_m/F03_speed_perfect_02_MATTEO_M_seg2.mp3'),
    speed_good_3_seg1: require('../../assets/audio/male_m/F03_speed_perfect_03_MATTEO_M_seg1.mp3'),
    speed_good_3_seg2: require('../../assets/audio/male_m/F03_speed_perfect_03_MATTEO_M_seg2.mp3'),
    weather_rain_1_seg1: require('../../assets/audio/male_m/G01_weather_rain_01_MATTEO_M_seg1.mp3'),
    weather_rain_1_seg2: require('../../assets/audio/male_m/G01_weather_rain_01_MATTEO_M_seg2.mp3'),
    weather_rain_2_seg1: require('../../assets/audio/male_m/G01_weather_rain_02_MATTEO_M_seg1.mp3'),
    weather_rain_2_seg2: require('../../assets/audio/male_m/G01_weather_rain_02_MATTEO_M_seg2.mp3'),
    weather_rain_3: require('../../assets/audio/male_m/G01_weather_rain_03_MATTEO_M.mp3'),
    weather_cold_1: require('../../assets/audio/male_m/G02_weather_cold_01_MATTEO_M.mp3'),
    weather_cold_2: require('../../assets/audio/male_m/G02_weather_cold_02_MATTEO_M.mp3'),
    weather_cold_3_seg1: require('../../assets/audio/male_m/G02_weather_cold_03_MATTEO_M_seg1.mp3'),
    weather_cold_3_seg2: require('../../assets/audio/male_m/G02_weather_cold_03_MATTEO_M_seg2.mp3'),
    weather_heat_1: require('../../assets/audio/male_m/G03_weather_hot_01_MATTEO_M.mp3'),
    weather_heat_2: require('../../assets/audio/male_m/G03_weather_hot_02_MATTEO_M.mp3'),
    weather_heat_3_seg1: require('../../assets/audio/male_m/G03_weather_hot_03_MATTEO_M_seg1.mp3'),
    weather_heat_3_seg2: require('../../assets/audio/male_m/G03_weather_hot_03_MATTEO_M_seg2.mp3'),
    weather_heat_4_seg1: require('../../assets/audio/male_m/G03_weather_hot_04_MATTEO_M_seg1.mp3'),
    weather_heat_4_seg2: require('../../assets/audio/male_m/G03_weather_hot_04_MATTEO_M_seg2.mp3'),
    weather_wind_1_seg1: require('../../assets/audio/male_m/G04_weather_wind_01_MATTEO_M_seg1.mp3'),
    weather_wind_1_seg2: require('../../assets/audio/male_m/G04_weather_wind_01_MATTEO_M_seg2.mp3'),
    weather_wind_2: require('../../assets/audio/male_m/G04_weather_wind_02_MATTEO_M.mp3'),
    weather_wind_3: require('../../assets/audio/male_m/G04_weather_wind_03_MATTEO_M.mp3'),
    time_predawn_1: require('../../assets/audio/male_m/H01_time_predawn_01_MATTEO_M.mp3'),
    time_predawn_2_seg1: require('../../assets/audio/male_m/H01_time_predawn_02_MATTEO_M_seg1.mp3'),
    time_predawn_2_seg2: require('../../assets/audio/male_m/H01_time_predawn_02_MATTEO_M_seg2.mp3'),
    time_predawn_3_seg1: require('../../assets/audio/male_m/H01_time_predawn_03_MATTEO_M_seg1.mp3'),
    time_predawn_3_seg2: require('../../assets/audio/male_m/H01_time_predawn_03_MATTEO_M_seg2.mp3'),
    time_dawn_1_seg1: require('../../assets/audio/male_m/H02_time_dawn_01_MATTEO_M_seg1.mp3'),
    time_dawn_1_seg2: require('../../assets/audio/male_m/H02_time_dawn_01_MATTEO_M_seg2.mp3'),
    time_dawn_2: require('../../assets/audio/male_m/H02_time_dawn_02_MATTEO_M.mp3'),
    time_dawn_3_seg1: require('../../assets/audio/male_m/H02_time_dawn_03_MATTEO_M_seg1.mp3'),
    time_dawn_3_seg2: require('../../assets/audio/male_m/H02_time_dawn_03_MATTEO_M_seg2.mp3'),
    time_lunch_1_seg1: require('../../assets/audio/male_m/H03_time_lunch_01_MATTEO_M_seg1.mp3'),
    time_lunch_1_seg2: require('../../assets/audio/male_m/H03_time_lunch_01_MATTEO_M_seg2.mp3'),
    time_lunch_2: require('../../assets/audio/male_m/H03_time_lunch_02_MATTEO_M.mp3'),
    time_lunch_3_seg1: require('../../assets/audio/male_m/H03_time_lunch_03_MATTEO_M_seg1.mp3'),
    time_lunch_3_seg2: require('../../assets/audio/male_m/H03_time_lunch_03_MATTEO_M_seg2.mp3'),
    time_sunset_1_seg1: require('../../assets/audio/male_m/H04_time_sunset_01_MATTEO_M_seg1.mp3'),
    time_sunset_2_seg1: require('../../assets/audio/male_m/H04_time_sunset_02_MATTEO_M_seg1.mp3'),
    time_sunset_3_seg1: require('../../assets/audio/male_m/H04_time_sunset_03_MATTEO_M_seg1.mp3'),
    time_sunset_3_seg2: require('../../assets/audio/male_m/H04_time_sunset_03_MATTEO_M_seg2.mp3'),
    time_night_1_seg1: require('../../assets/audio/male_m/H05_time_night_01_MATTEO_M_seg1.mp3'),
    time_night_1_seg2: require('../../assets/audio/male_m/H05_time_night_01_MATTEO_M_seg2.mp3'),
    time_night_2: require('../../assets/audio/male_m/H05_time_night_02_MATTEO_M.mp3'),
    time_night_3_seg1: require('../../assets/audio/male_m/H05_time_night_03_MATTEO_M_seg1.mp3'),
    time_night_3_seg2: require('../../assets/audio/male_m/H05_time_night_03_MATTEO_M_seg2.mp3'),
    record_distance_1_seg1: require('../../assets/audio/male_m/I01_record_distance_01_MATTEO_M_seg1.mp3'),
    record_distance_1_seg2: require('../../assets/audio/male_m/I01_record_distance_01_MATTEO_M_seg2.mp3'),
    record_distance_2_seg1: require('../../assets/audio/male_m/I01_record_distance_02_MATTEO_M_seg1.mp3'),
    record_distance_2_seg2: require('../../assets/audio/male_m/I01_record_distance_02_MATTEO_M_seg2.mp3'),
    record_distance_3_seg1: require('../../assets/audio/male_m/I01_record_distance_03_MATTEO_M_seg1.mp3'),
    record_distance_3_seg2: require('../../assets/audio/male_m/I01_record_distance_03_MATTEO_M_seg2.mp3'),
    record_speed_1_seg1: require('../../assets/audio/male_m/I02_record_speed_01_MATTEO_M_seg1.mp3'),
    record_speed_1_seg2: require('../../assets/audio/male_m/I02_record_speed_01_MATTEO_M_seg2.mp3'),
    record_speed_2_seg1: require('../../assets/audio/male_m/I02_record_speed_02_MATTEO_M_seg1.mp3'),
    record_speed_2_seg2: require('../../assets/audio/male_m/I02_record_speed_02_MATTEO_M_seg2.mp3'),
    record_speed_3_seg1: require('../../assets/audio/male_m/I02_record_speed_03_MATTEO_M_seg1.mp3'),
    record_speed_3_seg2: require('../../assets/audio/male_m/I02_record_speed_03_MATTEO_M_seg2.mp3'),
    record_steps_1_seg1: require('../../assets/audio/male_m/I03_record_steps_01_MATTEO_M_seg1.mp3'),
    record_steps_1_seg2: require('../../assets/audio/male_m/I03_record_steps_01_MATTEO_M_seg2.mp3'),
    record_steps_2_seg1: require('../../assets/audio/male_m/I03_record_steps_02_MATTEO_M_seg1.mp3'),
    record_steps_2_seg2: require('../../assets/audio/male_m/I03_record_steps_02_MATTEO_M_seg2.mp3'),
    record_steps_3_seg1: require('../../assets/audio/male_m/I03_record_steps_03_MATTEO_M_seg1.mp3'),
    record_steps_3_seg2: require('../../assets/audio/male_m/I03_record_steps_03_MATTEO_M_seg2.mp3'),
    record_duration_1_seg1: require('../../assets/audio/male_m/I04_record_duration_01_MATTEO_M_seg1.mp3'),
    record_duration_1_seg2: require('../../assets/audio/male_m/I04_record_duration_01_MATTEO_M_seg2.mp3'),
    record_duration_2_seg1: require('../../assets/audio/male_m/I04_record_duration_02_MATTEO_M_seg1.mp3'),
    record_duration_2_seg2: require('../../assets/audio/male_m/I04_record_duration_02_MATTEO_M_seg2.mp3'),
    record_duration_3_seg1: require('../../assets/audio/male_m/I04_record_duration_03_MATTEO_M_seg1.mp3'),
    record_duration_3_seg2: require('../../assets/audio/male_m/I04_record_duration_03_MATTEO_M_seg2.mp3'),
    streak_3_1_seg1: require('../../assets/audio/male_m/L01_streak_3_01_MATTEO_M_seg1.mp3'),
    streak_3_1_seg2: require('../../assets/audio/male_m/L01_streak_3_01_MATTEO_M_seg2.mp3'),
    streak_3_2_seg1: require('../../assets/audio/male_m/L01_streak_3_02_MATTEO_M_seg1.mp3'),
    streak_3_2_seg2: require('../../assets/audio/male_m/L01_streak_3_02_MATTEO_M_seg2.mp3'),
    streak_3_3_seg1: require('../../assets/audio/male_m/L01_streak_3_03_MATTEO_M_seg1.mp3'),
    streak_3_3_seg2: require('../../assets/audio/male_m/L01_streak_3_03_MATTEO_M_seg2.mp3'),
    streak_14_1_seg1: require('../../assets/audio/male_m/L02_streak_14_01_MATTEO_M_seg1.mp3'),
    streak_14_1_seg2: require('../../assets/audio/male_m/L02_streak_14_01_MATTEO_M_seg2.mp3'),
    streak_14_2_seg1: require('../../assets/audio/male_m/L02_streak_14_02_MATTEO_M_seg1.mp3'),
    streak_14_2_seg2: require('../../assets/audio/male_m/L02_streak_14_02_MATTEO_M_seg2.mp3'),
    streak_14_3_seg1: require('../../assets/audio/male_m/L02_streak_14_03_MATTEO_M_seg1.mp3'),
    streak_14_3_seg2: require('../../assets/audio/male_m/L02_streak_14_03_MATTEO_M_seg2.mp3'),
    streak_30_1_seg1: require('../../assets/audio/male_m/L03_streak_30_01_MATTEO_M_seg1.mp3'),
    streak_30_1_seg2: require('../../assets/audio/male_m/L03_streak_30_01_MATTEO_M_seg2.mp3'),
    streak_30_2_seg1: require('../../assets/audio/male_m/L03_streak_30_02_MATTEO_M_seg1.mp3'),
    streak_30_2_seg2: require('../../assets/audio/male_m/L03_streak_30_02_MATTEO_M_seg2.mp3'),
    streak_30_3_seg1: require('../../assets/audio/male_m/L03_streak_30_03_MATTEO_M_seg1.mp3'),
    streak_30_3_seg2: require('../../assets/audio/male_m/L03_streak_30_03_MATTEO_M_seg2.mp3'),
    comeback_short_1_seg1: require('../../assets/audio/male_m/L04_comeback_short_01_MATTEO_M_seg1.mp3'),
    comeback_short_1_seg2: require('../../assets/audio/male_m/L04_comeback_short_01_MATTEO_M_seg2.mp3'),
    comeback_short_2: require('../../assets/audio/male_m/L04_comeback_short_02_MATTEO_M.mp3'),
    comeback_short_3_seg1: require('../../assets/audio/male_m/L04_comeback_short_03_MATTEO_M_seg1.mp3'),
    comeback_short_3_seg2: require('../../assets/audio/male_m/L04_comeback_short_03_MATTEO_M_seg2.mp3'),
    comeback_long_1_seg1: require('../../assets/audio/male_m/L05_comeback_long_01_MATTEO_M_seg1.mp3'),
    comeback_long_1_seg2: require('../../assets/audio/male_m/L05_comeback_long_01_MATTEO_M_seg2.mp3'),
    comeback_long_2: require('../../assets/audio/male_m/L05_comeback_long_02_MATTEO_M.mp3'),
    comeback_long_3_seg1: require('../../assets/audio/male_m/L05_comeback_long_03_MATTEO_M_seg1.mp3'),
    comeback_long_3_seg2: require('../../assets/audio/male_m/L05_comeback_long_03_MATTEO_M_seg2.mp3'),
    science_cal_1_seg1: require('../../assets/audio/male_m/N01_science_cal_01_MATTEO_M_seg1.mp3'),
    science_cal_1_seg2: require('../../assets/audio/male_m/N01_science_cal_01_MATTEO_M_seg2.mp3'),
    science_cal_2: require('../../assets/audio/male_m/N01_science_cal_02_MATTEO_M.mp3'),
    science_cal_3: require('../../assets/audio/male_m/N01_science_cal_03_MATTEO_M.mp3'),
    science_heart_1_seg1: require('../../assets/audio/male_m/N02_science_heart_01_MATTEO_M_seg1.mp3'),
    science_heart_2: require('../../assets/audio/male_m/N02_science_heart_02_MATTEO_M.mp3'),
    science_heart_3: require('../../assets/audio/male_m/N02_science_heart_03_MATTEO_M.mp3'),
    science_metab_1: require('../../assets/audio/male_m/N03_science_metab_01_MATTEO_M.mp3'),
    science_metab_2: require('../../assets/audio/male_m/N03_science_metab_02_MATTEO_M.mp3'),
    science_metab_3_seg1: require('../../assets/audio/male_m/N03_science_metab_03_MATTEO_M_seg1.mp3'),
    science_sleep_1_seg1: require('../../assets/audio/male_m/N04_science_sleep_01_MATTEO_M_seg1.mp3'),
    science_sleep_1_seg2: require('../../assets/audio/male_m/N04_science_sleep_01_MATTEO_M_seg2.mp3'),
    science_sleep_2: require('../../assets/audio/male_m/N04_science_sleep_02_MATTEO_M.mp3'),
    science_sleep_3_seg1: require('../../assets/audio/male_m/N04_science_sleep_03_MATTEO_M_seg1.mp3'),
    science_sleep_3_seg2: require('../../assets/audio/male_m/N04_science_sleep_03_MATTEO_M_seg2.mp3'),
    science_mood_1: require('../../assets/audio/male_m/N05_science_mood_01_MATTEO_M.mp3'),
    science_mood_2_seg1: require('../../assets/audio/male_m/N05_science_mood_02_MATTEO_M_seg1.mp3'),
    science_mood_2_seg2: require('../../assets/audio/male_m/N05_science_mood_02_MATTEO_M_seg2.mp3'),
    science_mood_3: require('../../assets/audio/male_m/N05_science_mood_03_MATTEO_M.mp3'),
    science_body_1: require('../../assets/audio/male_m/N06_science_posture_01_MATTEO_M.mp3'),
    science_body_2_seg1: require('../../assets/audio/male_m/N06_science_posture_02_MATTEO_M_seg1.mp3'),
    science_body_2_seg2: require('../../assets/audio/male_m/N06_science_posture_02_MATTEO_M_seg2.mp3'),
    science_body_3: require('../../assets/audio/male_m/N06_science_posture_03_MATTEO_M.mp3'),
    uphill_1_seg1: require('../../assets/audio/male_m/O02_motivation_uphill_01_MATTEO_M_seg1.mp3'),
    uphill_1_seg2: require('../../assets/audio/male_m/O02_motivation_uphill_01_MATTEO_M_seg2.mp3'),
    uphill_2_seg1: require('../../assets/audio/male_m/O02_motivation_uphill_02_MATTEO_M_seg1.mp3'),
    uphill_2_seg2: require('../../assets/audio/male_m/O02_motivation_uphill_02_MATTEO_M_seg2.mp3'),
    uphill_3_seg1: require('../../assets/audio/male_m/O02_motivation_uphill_03_MATTEO_M_seg1.mp3'),
    uphill_3_seg2: require('../../assets/audio/male_m/O02_motivation_uphill_03_MATTEO_M_seg2.mp3'),
    milestone_1km_1_seg1: require('../../assets/audio/male_m/A01_milestone_1km_01_MATTEO_M_seg1.mp3'),
    milestone_1km_1_seg2: require('../../assets/audio/male_m/A01_milestone_1km_01_MATTEO_M_seg2.mp3'),
    milestone_1km_2_seg1: require('../../assets/audio/male_m/A01_milestone_1km_02_MATTEO_M_seg1.mp3'),
    milestone_1km_2_seg2: require('../../assets/audio/male_m/A01_milestone_1km_02_MATTEO_M_seg2.mp3'),
    milestone_1km_3_seg1: require('../../assets/audio/male_m/A01_milestone_1km_03_MATTEO_M_seg1.mp3'),
    milestone_1km_3_seg2: require('../../assets/audio/male_m/A01_milestone_1km_03_MATTEO_M_seg2.mp3'),
    milestone_2km_1_seg1: require('../../assets/audio/male_m/A02_milestone_2km_01_MATTEO_M_seg1.mp3'),
    milestone_2km_1_seg2: require('../../assets/audio/male_m/A02_milestone_2km_01_MATTEO_M_seg2.mp3'),
    milestone_2km_2_seg1: require('../../assets/audio/male_m/A02_milestone_2km_02_MATTEO_M_seg1.mp3'),
    milestone_2km_2_seg2: require('../../assets/audio/male_m/A02_milestone_2km_02_MATTEO_M_seg2.mp3'),
    milestone_2km_3_seg1: require('../../assets/audio/male_m/A02_milestone_2km_03_MATTEO_M_seg1.mp3'),
    milestone_2km_3_seg2: require('../../assets/audio/male_m/A02_milestone_2km_03_MATTEO_M_seg2.mp3'),
    milestone_3km_1_seg1: require('../../assets/audio/male_m/A03_milestone_3km_01_MATTEO_M_seg1.mp3'),
    milestone_3km_1_seg2: require('../../assets/audio/male_m/A03_milestone_3km_01_MATTEO_M_seg2.mp3'),
    milestone_3km_2_seg1: require('../../assets/audio/male_m/A03_milestone_3km_02_MATTEO_M_seg1.mp3'),
    milestone_3km_2_seg2: require('../../assets/audio/male_m/A03_milestone_3km_02_MATTEO_M_seg2.mp3'),
    milestone_3km_3_seg1: require('../../assets/audio/male_m/A03_milestone_3km_03_MATTEO_M_seg1.mp3'),
    milestone_3km_3_seg2: require('../../assets/audio/male_m/A03_milestone_3km_03_MATTEO_M_seg2.mp3'),
    milestone_4km_1_seg1: require('../../assets/audio/male_m/A04_milestone_4km_01_MATTEO_M_seg1.mp3'),
    milestone_4km_1_seg2: require('../../assets/audio/male_m/A04_milestone_4km_01_MATTEO_M_seg2.mp3'),
    milestone_4km_2_seg1: require('../../assets/audio/male_m/A04_milestone_4km_02_MATTEO_M_seg1.mp3'),
    milestone_4km_2_seg2: require('../../assets/audio/male_m/A04_milestone_4km_02_MATTEO_M_seg2.mp3'),
    milestone_4km_3_seg1: require('../../assets/audio/male_m/A04_milestone_4km_03_MATTEO_M_seg1.mp3'),
    milestone_4km_3_seg2: require('../../assets/audio/male_m/A04_milestone_4km_03_MATTEO_M_seg2.mp3'),
    milestone_5km_1_seg1: require('../../assets/audio/male_m/A05_milestone_5km_01_MATTEO_M_seg1.mp3'),
    milestone_5km_1_seg2: require('../../assets/audio/male_m/A05_milestone_5km_01_MATTEO_M_seg2.mp3'),
    milestone_5km_2_seg1: require('../../assets/audio/male_m/A05_milestone_5km_02_MATTEO_M_seg1.mp3'),
    milestone_5km_2_seg2: require('../../assets/audio/male_m/A05_milestone_5km_02_MATTEO_M_seg2.mp3'),
    milestone_5km_3_seg1: require('../../assets/audio/male_m/A05_milestone_5km_03_MATTEO_M_seg1.mp3'),
    milestone_5km_3_seg2: require('../../assets/audio/male_m/A05_milestone_5km_03_MATTEO_M_seg2.mp3'),
    quarter_done_1_seg1: require('../../assets/audio/male_m/B01_quarter_done_01_MATTEO_M_seg1.mp3'),
    quarter_done_1_seg2: require('../../assets/audio/male_m/B01_quarter_done_01_MATTEO_M_seg2.mp3'),
    quarter_done_2_seg1: require('../../assets/audio/male_m/B01_quarter_done_02_MATTEO_M_seg1.mp3'),
    quarter_done_2_seg2: require('../../assets/audio/male_m/B01_quarter_done_02_MATTEO_M_seg2.mp3'),
    quarter_done_3_seg1: require('../../assets/audio/male_m/B01_quarter_done_03_MATTEO_M_seg1.mp3'),
    quarter_done_3_seg2: require('../../assets/audio/male_m/B01_quarter_done_03_MATTEO_M_seg2.mp3'),
    halfway_1_seg1: require('../../assets/audio/male_m/B02_halfway_01_MATTEO_M_seg1.mp3'),
    halfway_1_seg2: require('../../assets/audio/male_m/B02_halfway_01_MATTEO_M_seg2.mp3'),
    halfway_2_seg1: require('../../assets/audio/male_m/B02_halfway_02_MATTEO_M_seg1.mp3'),
    halfway_2_seg2: require('../../assets/audio/male_m/B02_halfway_02_MATTEO_M_seg2.mp3'),
    halfway_3_seg1: require('../../assets/audio/male_m/B02_halfway_03_MATTEO_M_seg1.mp3'),
    halfway_3_seg2: require('../../assets/audio/male_m/B02_halfway_03_MATTEO_M_seg2.mp3'),
    halfway_4_seg1: require('../../assets/audio/male_m/B02_halfway_04_MATTEO_M_seg1.mp3'),
    halfway_4_seg2: require('../../assets/audio/male_m/B02_halfway_04_MATTEO_M_seg2.mp3'),
    three_quarters_1_seg1: require('../../assets/audio/male_m/B03_three_quarters_01_MATTEO_M_seg1.mp3'),
    three_quarters_1_seg2: require('../../assets/audio/male_m/B03_three_quarters_01_MATTEO_M_seg2.mp3'),
    three_quarters_2_seg1: require('../../assets/audio/male_m/B03_three_quarters_02_MATTEO_M_seg1.mp3'),
    three_quarters_2_seg2: require('../../assets/audio/male_m/B03_three_quarters_02_MATTEO_M_seg2.mp3'),
    three_quarters_3_seg1: require('../../assets/audio/male_m/B03_three_quarters_03_MATTEO_M_seg1.mp3'),
    three_quarters_3_seg2: require('../../assets/audio/male_m/B03_three_quarters_03_MATTEO_M_seg2.mp3'),
    last_min_cooldown_1_seg1: require('../../assets/audio/male_m/B04_last_min_cooldown_01_MATTEO_M_seg1.mp3'),
    last_min_cooldown_1_seg2: require('../../assets/audio/male_m/B04_last_min_cooldown_01_MATTEO_M_seg2.mp3'),
    last_min_cooldown_2_seg1: require('../../assets/audio/male_m/B04_last_min_cooldown_02_MATTEO_M_seg1.mp3'),
    last_min_cooldown_2_seg2: require('../../assets/audio/male_m/B04_last_min_cooldown_02_MATTEO_M_seg2.mp3'),
    last_min_cooldown_3_seg1: require('../../assets/audio/male_m/B04_last_min_cooldown_03_MATTEO_M_seg1.mp3'),
    last_min_cooldown_3_seg2: require('../../assets/audio/male_m/B04_last_min_cooldown_03_MATTEO_M_seg2.mp3'),
    workout_complete_1_seg1: require('../../assets/audio/male_m/B05_workout_complete_01_MATTEO_M_seg1.mp3'),
    workout_complete_1_seg2: require('../../assets/audio/male_m/B05_workout_complete_01_MATTEO_M_seg2.mp3'),
    workout_complete_2_seg1: require('../../assets/audio/male_m/B05_workout_complete_02_MATTEO_M_seg1.mp3'),
    workout_complete_2_seg2: require('../../assets/audio/male_m/B05_workout_complete_02_MATTEO_M_seg2.mp3'),
    workout_complete_3_seg1: require('../../assets/audio/male_m/B05_workout_complete_03_MATTEO_M_seg1.mp3'),
    workout_complete_3_seg2: require('../../assets/audio/male_m/B05_workout_complete_03_MATTEO_M_seg2.mp3'),
    workout_complete_4_seg1: require('../../assets/audio/male_m/B05_workout_complete_04_MATTEO_M_seg1.mp3'),
    workout_complete_4_seg2: require('../../assets/audio/male_m/B05_workout_complete_04_MATTEO_M_seg2.mp3'),
    badge_first_workout_1_seg1: require('../../assets/audio/male_m/B06_badge_first_workout_01_MATTEO_M_seg1.mp3'),
    badge_first_workout_1_seg2: require('../../assets/audio/male_m/B06_badge_first_workout_01_MATTEO_M_seg2.mp3'),
    badge_first_workout_2_seg1: require('../../assets/audio/male_m/B06_badge_first_workout_02_MATTEO_M_seg1.mp3'),
    badge_first_workout_2_seg2: require('../../assets/audio/male_m/B06_badge_first_workout_02_MATTEO_M_seg2.mp3'),
    badge_first_workout_3_seg1: require('../../assets/audio/male_m/B06_badge_first_workout_03_MATTEO_M_seg1.mp3'),
    badge_first_workout_3_seg2: require('../../assets/audio/male_m/B06_badge_first_workout_03_MATTEO_M_seg2.mp3'),
    badge_streak_7_1_seg1: require('../../assets/audio/male_m/B07_badge_streak_7_01_MATTEO_M_seg1.mp3'),
    badge_streak_7_1_seg2: require('../../assets/audio/male_m/B07_badge_streak_7_01_MATTEO_M_seg2.mp3'),
    badge_streak_7_2_seg1: require('../../assets/audio/male_m/B07_badge_streak_7_02_MATTEO_M_seg1.mp3'),
    badge_streak_7_2_seg2: require('../../assets/audio/male_m/B07_badge_streak_7_02_MATTEO_M_seg2.mp3'),
    badge_streak_7_3_seg1: require('../../assets/audio/male_m/B07_badge_streak_7_03_MATTEO_M_seg1.mp3'),
    badge_streak_7_3_seg2: require('../../assets/audio/male_m/B07_badge_streak_7_03_MATTEO_M_seg2.mp3'),
    badge_10k_steps_1_seg1: require('../../assets/audio/male_m/B08_badge_10k_steps_01_MATTEO_M_seg1.mp3'),
    badge_10k_steps_1_seg2: require('../../assets/audio/male_m/B08_badge_10k_steps_01_MATTEO_M_seg2.mp3'),
    badge_10k_steps_2_seg1: require('../../assets/audio/male_m/B08_badge_10k_steps_02_MATTEO_M_seg1.mp3'),
    badge_10k_steps_2_seg2: require('../../assets/audio/male_m/B08_badge_10k_steps_02_MATTEO_M_seg2.mp3'),
    badge_10k_steps_3_seg1: require('../../assets/audio/male_m/B08_badge_10k_steps_03_MATTEO_M_seg1.mp3'),
    badge_10k_steps_3_seg2: require('../../assets/audio/male_m/B08_badge_10k_steps_03_MATTEO_M_seg2.mp3'),
    badge_5km_total_1_seg1: require('../../assets/audio/male_m/B09_badge_5km_total_01_MATTEO_M_seg1.mp3'),
    badge_5km_total_1_seg2: require('../../assets/audio/male_m/B09_badge_5km_total_01_MATTEO_M_seg2.mp3'),
    badge_5km_total_2_seg1: require('../../assets/audio/male_m/B09_badge_5km_total_02_MATTEO_M_seg1.mp3'),
    badge_5km_total_2_seg2: require('../../assets/audio/male_m/B09_badge_5km_total_02_MATTEO_M_seg2.mp3'),
    badge_5km_total_3_seg1: require('../../assets/audio/male_m/B09_badge_5km_total_03_MATTEO_M_seg1.mp3'),
    badge_5km_total_3_seg2: require('../../assets/audio/male_m/B09_badge_5km_total_03_MATTEO_M_seg2.mp3'),
    badge_full_week_1_seg1: require('../../assets/audio/male_m/B10_badge_full_week_01_MATTEO_M_seg1.mp3'),
    badge_full_week_1_seg2: require('../../assets/audio/male_m/B10_badge_full_week_01_MATTEO_M_seg2.mp3'),
    badge_full_week_2_seg1: require('../../assets/audio/male_m/B10_badge_full_week_02_MATTEO_M_seg1.mp3'),
    badge_full_week_2_seg2: require('../../assets/audio/male_m/B10_badge_full_week_02_MATTEO_M_seg2.mp3'),
    badge_full_week_3_seg1: require('../../assets/audio/male_m/B10_badge_full_week_03_MATTEO_M_seg1.mp3'),
    badge_full_week_3_seg2: require('../../assets/audio/male_m/B10_badge_full_week_03_MATTEO_M_seg2.mp3'),
    badge_speed_demon_1_seg1: require('../../assets/audio/male_m/B11_badge_speed_demon_01_MATTEO_M_seg1.mp3'),
    badge_speed_demon_1_seg2: require('../../assets/audio/male_m/B11_badge_speed_demon_01_MATTEO_M_seg2.mp3'),
    badge_speed_demon_2_seg1: require('../../assets/audio/male_m/B11_badge_speed_demon_02_MATTEO_M_seg1.mp3'),
    badge_speed_demon_2_seg2: require('../../assets/audio/male_m/B11_badge_speed_demon_02_MATTEO_M_seg2.mp3'),
    badge_speed_demon_3_seg1: require('../../assets/audio/male_m/B11_badge_speed_demon_03_MATTEO_M_seg1.mp3'),
    badge_speed_demon_3_seg2: require('../../assets/audio/male_m/B11_badge_speed_demon_03_MATTEO_M_seg2.mp3'),
    badge_goal_reached_1_seg1: require('../../assets/audio/male_m/B12_badge_goal_reached_01_MATTEO_M_seg1.mp3'),
    badge_goal_reached_1_seg2: require('../../assets/audio/male_m/B12_badge_goal_reached_01_MATTEO_M_seg2.mp3'),
    badge_goal_reached_2_seg1: require('../../assets/audio/male_m/B12_badge_goal_reached_02_MATTEO_M_seg1.mp3'),
    badge_goal_reached_2_seg2: require('../../assets/audio/male_m/B12_badge_goal_reached_02_MATTEO_M_seg2.mp3'),
    badge_goal_reached_3_seg1: require('../../assets/audio/male_m/B12_badge_goal_reached_03_MATTEO_M_seg1.mp3'),
    badge_goal_reached_3_seg2: require('../../assets/audio/male_m/B12_badge_goal_reached_03_MATTEO_M_seg2.mp3'),
    invalid_workout_1: require('../../assets/audio/male_m/B13_invalid_workout_01_MATTEO_M.mp3'),
    invalid_workout_2: require('../../assets/audio/male_m/B13_invalid_workout_02_MATTEO_M.mp3'),
    invalid_workout_3: require('../../assets/audio/male_m/B13_invalid_workout_03_MATTEO_M.mp3'),
    pause_1: require('../../assets/audio/male_m/B14_pause_01_MATTEO_M.mp3'),
    pause_2: require('../../assets/audio/male_m/B14_pause_02_MATTEO_M.mp3'),
    pause_3: require('../../assets/audio/male_m/B14_pause_03_MATTEO_M.mp3'),
    resume_1: require('../../assets/audio/male_m/B15_resume_01_MATTEO_M.mp3'),
    resume_2: require('../../assets/audio/male_m/B15_resume_02_MATTEO_M.mp3'),
    resume_3: require('../../assets/audio/male_m/B15_resume_03_MATTEO_M.mp3'),
    Q01_duration_01: require('../../assets/audio/male_m/Q01_duration_01_MATTEO_M.mp3'),
    Q01_duration_02: require('../../assets/audio/male_m/Q01_duration_02_MATTEO_M.mp3'),
    Q01_duration_03: require('../../assets/audio/male_m/Q01_duration_03_MATTEO_M.mp3'),
    Q01_duration_04: require('../../assets/audio/male_m/Q01_duration_04_MATTEO_M.mp3'),
    Q01_duration_05: require('../../assets/audio/male_m/Q01_duration_05_MATTEO_M.mp3'),
    Q01_duration_06: require('../../assets/audio/male_m/Q01_duration_06_MATTEO_M.mp3'),
    Q01_duration_07: require('../../assets/audio/male_m/Q01_duration_07_MATTEO_M.mp3'),
    Q01_duration_08: require('../../assets/audio/male_m/Q01_duration_08_MATTEO_M.mp3'),
    Q01_duration_09: require('../../assets/audio/male_m/Q01_duration_09_MATTEO_M.mp3'),
    Q01_duration_10: require('../../assets/audio/male_m/Q01_duration_10_MATTEO_M.mp3'),
    Q01_duration_11: require('../../assets/audio/male_m/Q01_duration_11_MATTEO_M.mp3'),
    Q01_duration_12: require('../../assets/audio/male_m/Q01_duration_12_MATTEO_M.mp3'),
    Q01_duration_13: require('../../assets/audio/male_m/Q01_duration_13_MATTEO_M.mp3'),
    Q01_duration_14: require('../../assets/audio/male_m/Q01_duration_14_MATTEO_M.mp3'),
    Q01_duration_15: require('../../assets/audio/male_m/Q01_duration_15_MATTEO_M.mp3'),
    warmup_announce_01_seg1: require('../../assets/audio/male_m/Q02_warmup_announce_01_MATTEO_M_seg1.mp3'),
    warmup_announce_01_seg2: require('../../assets/audio/male_m/Q02_warmup_announce_01_MATTEO_M_seg2.mp3'),
    warmup_announce_02_seg1: require('../../assets/audio/male_m/Q02_warmup_announce_02_MATTEO_M_seg1.mp3'),
    warmup_announce_02_seg2: require('../../assets/audio/male_m/Q02_warmup_announce_02_MATTEO_M_seg2.mp3'),
    warmup_announce_03_seg1: require('../../assets/audio/male_m/Q02_warmup_announce_03_MATTEO_M_seg1.mp3'),
    warmup_announce_03_seg2: require('../../assets/audio/male_m/Q02_warmup_announce_03_MATTEO_M_seg2.mp3'),
    moderate_announce_01_seg1: require('../../assets/audio/male_m/Q03_moderate_announce_01_MATTEO_M_seg1.mp3'),
    moderate_announce_01_seg2: require('../../assets/audio/male_m/Q03_moderate_announce_01_MATTEO_M_seg2.mp3'),
    moderate_announce_02_seg1: require('../../assets/audio/male_m/Q03_moderate_announce_02_MATTEO_M_seg1.mp3'),
    moderate_announce_02_seg2: require('../../assets/audio/male_m/Q03_moderate_announce_02_MATTEO_M_seg2.mp3'),
    moderate_announce_03_seg1: require('../../assets/audio/male_m/Q03_moderate_announce_03_MATTEO_M_seg1.mp3'),
    moderate_announce_03_seg2: require('../../assets/audio/male_m/Q03_moderate_announce_03_MATTEO_M_seg2.mp3'),
    fast_announce_01_seg1: require('../../assets/audio/male_m/Q04_fast_announce_01_MATTEO_M_seg1.mp3'),
    fast_announce_01_seg2: require('../../assets/audio/male_m/Q04_fast_announce_01_MATTEO_M_seg2.mp3'),
    fast_announce_02_seg1: require('../../assets/audio/male_m/Q04_fast_announce_02_MATTEO_M_seg1.mp3'),
    fast_announce_02_seg2: require('../../assets/audio/male_m/Q04_fast_announce_02_MATTEO_M_seg2.mp3'),
    fast_announce_03_seg1: require('../../assets/audio/male_m/Q04_fast_announce_03_MATTEO_M_seg1.mp3'),
    fast_announce_03_seg2: require('../../assets/audio/male_m/Q04_fast_announce_03_MATTEO_M_seg2.mp3'),
    fast_announce_04_seg1: require('../../assets/audio/male_m/Q04_fast_announce_04_MATTEO_M_seg1.mp3'),
    fast_announce_04_seg2: require('../../assets/audio/male_m/Q04_fast_announce_04_MATTEO_M_seg2.mp3'),
    cooldown_announce_01_seg1: require('../../assets/audio/male_m/Q05_cooldown_announce_01_MATTEO_M_seg1.mp3'),
    cooldown_announce_01_seg2: require('../../assets/audio/male_m/Q05_cooldown_announce_01_MATTEO_M_seg2.mp3'),
    cooldown_announce_02_seg1: require('../../assets/audio/male_m/Q05_cooldown_announce_02_MATTEO_M_seg1.mp3'),
    cooldown_announce_02_seg2: require('../../assets/audio/male_m/Q05_cooldown_announce_02_MATTEO_M_seg2.mp3'),
    cooldown_announce_03_seg1: require('../../assets/audio/male_m/Q05_cooldown_announce_03_MATTEO_M_seg1.mp3'),
    cooldown_announce_03_seg2: require('../../assets/audio/male_m/Q05_cooldown_announce_03_MATTEO_M_seg2.mp3'),
  },
  male_f: {
    workout_start_1_seg1: require('../../assets/audio/male_f/D01_warmup_start_01_MATTEO_F_seg1.mp3'),
    workout_start_1_seg2: require('../../assets/audio/male_f/D01_warmup_start_01_MATTEO_F_seg2.mp3'),
    workout_start_2_seg1: require('../../assets/audio/male_f/D01_warmup_start_02_MATTEO_F_seg1.mp3'),
    workout_start_2_seg2: require('../../assets/audio/male_f/D01_warmup_start_02_MATTEO_F_seg2.mp3'),
    workout_start_3_seg1: require('../../assets/audio/male_f/D01_warmup_start_03_MATTEO_F_seg1.mp3'),
    workout_start_3_seg2: require('../../assets/audio/male_f/D01_warmup_start_03_MATTEO_F_seg2.mp3'),
    interval_moderate_1_seg1: require('../../assets/audio/male_f/D03_phase_moderate_01_MATTEO_F_seg1.mp3'),
    interval_moderate_1_seg2: require('../../assets/audio/male_f/D03_phase_moderate_01_MATTEO_F_seg2.mp3'),
    interval_moderate_2_seg1: require('../../assets/audio/male_f/D03_phase_moderate_02_MATTEO_F_seg1.mp3'),
    interval_moderate_2_seg2: require('../../assets/audio/male_f/D03_phase_moderate_02_MATTEO_F_seg2.mp3'),
    interval_moderate_3_seg1: require('../../assets/audio/male_f/D03_phase_moderate_03_MATTEO_F_seg1.mp3'),
    interval_fast_1_seg1: require('../../assets/audio/male_f/D04_phase_sustained_01_MATTEO_F_seg1.mp3'),
    interval_fast_1_seg2: require('../../assets/audio/male_f/D04_phase_sustained_01_MATTEO_F_seg2.mp3'),
    interval_fast_2_seg1: require('../../assets/audio/male_f/D04_phase_sustained_02_MATTEO_F_seg1.mp3'),
    interval_fast_2_seg2: require('../../assets/audio/male_f/D04_phase_sustained_02_MATTEO_F_seg2.mp3'),
    interval_fast_3_seg1: require('../../assets/audio/male_f/D04_phase_sustained_03_MATTEO_F_seg1.mp3'),
    interval_fast_3_seg2: require('../../assets/audio/male_f/D04_phase_sustained_03_MATTEO_F_seg2.mp3'),
    interval_fast_4_seg1: require('../../assets/audio/male_f/D04_phase_sustained_04_MATTEO_F_seg1.mp3'),
    interval_fast_4_seg2: require('../../assets/audio/male_f/D04_phase_sustained_04_MATTEO_F_seg2.mp3'),
    cooldown_1_seg1: require('../../assets/audio/male_f/D05_phase_recovery_01_MATTEO_F_seg1.mp3'),
    cooldown_1_seg2: require('../../assets/audio/male_f/D05_phase_recovery_01_MATTEO_F_seg2.mp3'),
    cooldown_2_seg1: require('../../assets/audio/male_f/D05_phase_recovery_02_MATTEO_F_seg1.mp3'),
    cooldown_2_seg2: require('../../assets/audio/male_f/D05_phase_recovery_02_MATTEO_F_seg2.mp3'),
    cooldown_3_seg1: require('../../assets/audio/male_f/D05_phase_recovery_03_MATTEO_F_seg1.mp3'),
    cooldown_3_seg2: require('../../assets/audio/male_f/D05_phase_recovery_03_MATTEO_F_seg2.mp3'),
    motivation_random_1_seg1: require('../../assets/audio/male_f/O01_motivation_push_01_MATTEO_F_seg1.mp3'),
    motivation_random_1_seg2: require('../../assets/audio/male_f/O01_motivation_push_01_MATTEO_F_seg2.mp3'),
    motivation_random_2: require('../../assets/audio/male_f/O01_motivation_push_02_MATTEO_F.mp3'),
    motivation_random_3: require('../../assets/audio/male_f/O01_motivation_push_03_MATTEO_F.mp3'),
    motivation_random_4_seg1: require('../../assets/audio/male_f/O01_motivation_push_04_MATTEO_F_seg1.mp3'),
    motivation_random_4_seg2: require('../../assets/audio/male_f/O01_motivation_push_04_MATTEO_F_seg2.mp3'),
    last_minute_1: require('../../assets/audio/male_f/O03_final_push_01_MATTEO_F.mp3'),
    last_minute_2: require('../../assets/audio/male_f/O03_final_push_02_MATTEO_F.mp3'),
    last_minute_3: require('../../assets/audio/male_f/O03_final_push_03_MATTEO_F.mp3'),
    last_minute_4: require('../../assets/audio/male_f/O03_final_push_04_MATTEO_F.mp3'),
    last_30_seconds_1: require('../../assets/audio/male_f/O03_final_push_05_MATTEO_F.mp3'),
    last_30_seconds_2: require('../../assets/audio/male_f/O03_final_push_06_MATTEO_F.mp3'),
    last_30_seconds_3: require('../../assets/audio/male_f/O03_final_push_07_MATTEO_F.mp3'),
    badge_rain_walker_1: require('../../assets/audio/male_f/C01_rain_walker_01_MATTEO_F.mp3'),
    badge_rain_walker_2_seg1: require('../../assets/audio/male_f/C01_rain_walker_02_MATTEO_F_seg1.mp3'),
    badge_rain_walker_2_seg2: require('../../assets/audio/male_f/C01_rain_walker_02_MATTEO_F_seg2.mp3'),
    badge_rain_walker_3_seg1: require('../../assets/audio/male_f/C01_rain_walker_03_MATTEO_F_seg1.mp3'),
    badge_rain_walker_3_seg2: require('../../assets/audio/male_f/C01_rain_walker_03_MATTEO_F_seg2.mp3'),
    badge_ice_walker_1_seg1: require('../../assets/audio/male_f/C02_ice_walker_01_MATTEO_F_seg1.mp3'),
    badge_ice_walker_2: require('../../assets/audio/male_f/C02_ice_walker_02_MATTEO_F.mp3'),
    badge_ice_walker_3_seg1: require('../../assets/audio/male_f/C02_ice_walker_03_MATTEO_F_seg1.mp3'),
    badge_ice_walker_3_seg2: require('../../assets/audio/male_f/C02_ice_walker_03_MATTEO_F_seg2.mp3'),
    badge_heat_warrior_1: require('../../assets/audio/male_f/C03_heat_warrior_01_MATTEO_F.mp3'),
    badge_heat_warrior_2_seg1: require('../../assets/audio/male_f/C03_heat_warrior_02_MATTEO_F_seg1.mp3'),
    badge_heat_warrior_2_seg2: require('../../assets/audio/male_f/C03_heat_warrior_02_MATTEO_F_seg2.mp3'),
    badge_heat_warrior_3_seg1: require('../../assets/audio/male_f/C03_heat_warrior_03_MATTEO_F_seg1.mp3'),
    badge_heat_warrior_3_seg2: require('../../assets/audio/male_f/C03_heat_warrior_03_MATTEO_F_seg2.mp3'),
    badge_wind_rider_1: require('../../assets/audio/male_f/C04_wind_rider_01_MATTEO_F.mp3'),
    badge_wind_rider_2_seg1: require('../../assets/audio/male_f/C04_wind_rider_02_MATTEO_F_seg1.mp3'),
    badge_wind_rider_2_seg2: require('../../assets/audio/male_f/C04_wind_rider_02_MATTEO_F_seg2.mp3'),
    badge_wind_rider_3_seg1: require('../../assets/audio/male_f/C04_wind_rider_03_MATTEO_F_seg1.mp3'),
    badge_wind_rider_3_seg2: require('../../assets/audio/male_f/C04_wind_rider_03_MATTEO_F_seg2.mp3'),
    badge_early_bird_1: require('../../assets/audio/male_f/C05_early_bird_01_MATTEO_F.mp3'),
    badge_early_bird_2_seg1: require('../../assets/audio/male_f/C05_early_bird_02_MATTEO_F_seg1.mp3'),
    badge_early_bird_2_seg2: require('../../assets/audio/male_f/C05_early_bird_02_MATTEO_F_seg2.mp3'),
    badge_early_bird_3_seg1: require('../../assets/audio/male_f/C05_early_bird_03_MATTEO_F_seg1.mp3'),
    badge_early_bird_3_seg2: require('../../assets/audio/male_f/C05_early_bird_03_MATTEO_F_seg2.mp3'),
    badge_night_owl_1: require('../../assets/audio/male_f/C06_night_owl_01_MATTEO_F.mp3'),
    badge_night_owl_2_seg1: require('../../assets/audio/male_f/C06_night_owl_02_MATTEO_F_seg1.mp3'),
    badge_night_owl_2_seg2: require('../../assets/audio/male_f/C06_night_owl_02_MATTEO_F_seg2.mp3'),
    badge_night_owl_3: require('../../assets/audio/male_f/C06_night_owl_03_MATTEO_F.mp3'),
    badge_all_weather_1: require('../../assets/audio/male_f/C07_all_weather_01_MATTEO_F.mp3'),
    badge_all_weather_2_seg1: require('../../assets/audio/male_f/C07_all_weather_02_MATTEO_F_seg1.mp3'),
    badge_all_weather_2_seg2: require('../../assets/audio/male_f/C07_all_weather_02_MATTEO_F_seg2.mp3'),
    badge_all_weather_3_seg1: require('../../assets/audio/male_f/C07_all_weather_03_MATTEO_F_seg1.mp3'),
    badge_all_weather_3_seg2: require('../../assets/audio/male_f/C07_all_weather_03_MATTEO_F_seg2.mp3'),
    badge_unstoppable_1: require('../../assets/audio/male_f/C08_unstoppable_01_MATTEO_F.mp3'),
    badge_unstoppable_2_seg1: require('../../assets/audio/male_f/C08_unstoppable_02_MATTEO_F_seg1.mp3'),
    badge_unstoppable_2_seg2: require('../../assets/audio/male_f/C08_unstoppable_02_MATTEO_F_seg2.mp3'),
    badge_unstoppable_3_seg1: require('../../assets/audio/male_f/C08_unstoppable_03_MATTEO_F_seg1.mp3'),
    badge_unstoppable_3_seg2: require('../../assets/audio/male_f/C08_unstoppable_03_MATTEO_F_seg2.mp3'),
    badge_dawn_patrol_1: require('../../assets/audio/male_f/C09_dawn_patrol_01_MATTEO_F.mp3'),
    badge_dawn_patrol_2_seg1: require('../../assets/audio/male_f/C09_dawn_patrol_02_MATTEO_F_seg1.mp3'),
    badge_dawn_patrol_2_seg2: require('../../assets/audio/male_f/C09_dawn_patrol_02_MATTEO_F_seg2.mp3'),
    badge_dawn_patrol_3_seg1: require('../../assets/audio/male_f/C09_dawn_patrol_03_MATTEO_F_seg1.mp3'),
    badge_dawn_patrol_3_seg2: require('../../assets/audio/male_f/C09_dawn_patrol_03_MATTEO_F_seg2.mp3'),
    badge_sunset_lover_1: require('../../assets/audio/male_f/C10_sunset_lover_01_MATTEO_F.mp3'),
    badge_sunset_lover_2_seg1: require('../../assets/audio/male_f/C10_sunset_lover_02_MATTEO_F_seg1.mp3'),
    badge_sunset_lover_2_seg2: require('../../assets/audio/male_f/C10_sunset_lover_02_MATTEO_F_seg2.mp3'),
    badge_sunset_lover_3_seg1: require('../../assets/audio/male_f/C10_sunset_lover_03_MATTEO_F_seg1.mp3'),
    badge_sunset_lover_3_seg2: require('../../assets/audio/male_f/C10_sunset_lover_03_MATTEO_F_seg2.mp3'),
    badge_lunch_hero_1: require('../../assets/audio/male_f/C11_lunch_hero_01_MATTEO_F.mp3'),
    badge_lunch_hero_2_seg1: require('../../assets/audio/male_f/C11_lunch_hero_02_MATTEO_F_seg1.mp3'),
    badge_lunch_hero_2_seg2: require('../../assets/audio/male_f/C11_lunch_hero_02_MATTEO_F_seg2.mp3'),
    badge_lunch_hero_3_seg1: require('../../assets/audio/male_f/C11_lunch_hero_03_MATTEO_F_seg1.mp3'),
    badge_lunch_hero_3_seg2: require('../../assets/audio/male_f/C11_lunch_hero_03_MATTEO_F_seg2.mp3'),
    badge_four_seasons_1: require('../../assets/audio/male_f/C12_four_seasons_01_MATTEO_F.mp3'),
    badge_four_seasons_2_seg1: require('../../assets/audio/male_f/C12_four_seasons_02_MATTEO_F_seg1.mp3'),
    badge_four_seasons_2_seg2: require('../../assets/audio/male_f/C12_four_seasons_02_MATTEO_F_seg2.mp3'),
    badge_four_seasons_3_seg1: require('../../assets/audio/male_f/C12_four_seasons_03_MATTEO_F_seg1.mp3'),
    badge_four_seasons_3_seg2: require('../../assets/audio/male_f/C12_four_seasons_03_MATTEO_F_seg2.mp3'),
    body_hydration_1_seg1: require('../../assets/audio/male_f/E01_hydration_01_MATTEO_F_seg1.mp3'),
    body_hydration_1_seg2: require('../../assets/audio/male_f/E01_hydration_01_MATTEO_F_seg2.mp3'),
    body_hydration_2_seg1: require('../../assets/audio/male_f/E01_hydration_02_MATTEO_F_seg1.mp3'),
    body_hydration_2_seg2: require('../../assets/audio/male_f/E01_hydration_02_MATTEO_F_seg2.mp3'),
    body_hydration_3_seg1: require('../../assets/audio/male_f/E01_hydration_03_MATTEO_F_seg1.mp3'),
    body_hydration_3_seg2: require('../../assets/audio/male_f/E01_hydration_03_MATTEO_F_seg2.mp3'),
    body_hydration_4_seg1: require('../../assets/audio/male_f/E01_hydration_04_MATTEO_F_seg1.mp3'),
    body_hydration_4_seg2: require('../../assets/audio/male_f/E01_hydration_04_MATTEO_F_seg2.mp3'),
    body_posture_1_seg1: require('../../assets/audio/male_f/E02_posture_01_MATTEO_F_seg1.mp3'),
    body_posture_1_seg2: require('../../assets/audio/male_f/E02_posture_01_MATTEO_F_seg2.mp3'),
    body_posture_2: require('../../assets/audio/male_f/E02_posture_02_MATTEO_F.mp3'),
    body_posture_3: require('../../assets/audio/male_f/E02_posture_03_MATTEO_F.mp3'),
    body_posture_4_seg1: require('../../assets/audio/male_f/E02_posture_04_MATTEO_F_seg1.mp3'),
    body_posture_4_seg2: require('../../assets/audio/male_f/E02_posture_04_MATTEO_F_seg2.mp3'),
    body_breathing_1: require('../../assets/audio/male_f/E03_breathing_01_MATTEO_F.mp3'),
    body_breathing_2: require('../../assets/audio/male_f/E03_breathing_02_MATTEO_F.mp3'),
    body_breathing_3: require('../../assets/audio/male_f/E03_breathing_03_MATTEO_F.mp3'),
    body_breathing_4: require('../../assets/audio/male_f/E03_breathing_04_MATTEO_F.mp3'),
    body_cadence_1: require('../../assets/audio/male_f/E04_cadence_01_MATTEO_F.mp3'),
    body_cadence_2: require('../../assets/audio/male_f/E04_cadence_02_MATTEO_F.mp3'),
    body_cadence_3: require('../../assets/audio/male_f/E04_cadence_03_MATTEO_F.mp3'),
    speed_fast_1: require('../../assets/audio/male_f/F01_speed_fast_01_MATTEO_F.mp3'),
    speed_fast_2_seg1: require('../../assets/audio/male_f/F01_speed_fast_02_MATTEO_F_seg1.mp3'),
    speed_fast_2_seg2: require('../../assets/audio/male_f/F01_speed_fast_02_MATTEO_F_seg2.mp3'),
    speed_fast_3: require('../../assets/audio/male_f/F01_speed_fast_03_MATTEO_F.mp3'),
    speed_too_slow_1: require('../../assets/audio/male_f/F02_speed_slow_01_MATTEO_F.mp3'),
    speed_too_slow_2: require('../../assets/audio/male_f/F02_speed_slow_02_MATTEO_F.mp3'),
    speed_too_slow_3_seg1: require('../../assets/audio/male_f/F02_speed_slow_03_MATTEO_F_seg1.mp3'),
    speed_too_slow_3_seg2: require('../../assets/audio/male_f/F02_speed_slow_03_MATTEO_F_seg2.mp3'),
    speed_good_1_seg1: require('../../assets/audio/male_f/F03_speed_perfect_01_MATTEO_F_seg1.mp3'),
    speed_good_1_seg2: require('../../assets/audio/male_f/F03_speed_perfect_01_MATTEO_F_seg2.mp3'),
    speed_good_2_seg1: require('../../assets/audio/male_f/F03_speed_perfect_02_MATTEO_F_seg1.mp3'),
    speed_good_2_seg2: require('../../assets/audio/male_f/F03_speed_perfect_02_MATTEO_F_seg2.mp3'),
    speed_good_3_seg1: require('../../assets/audio/male_f/F03_speed_perfect_03_MATTEO_F_seg1.mp3'),
    speed_good_3_seg2: require('../../assets/audio/male_f/F03_speed_perfect_03_MATTEO_F_seg2.mp3'),
    weather_rain_1_seg1: require('../../assets/audio/male_f/G01_weather_rain_01_MATTEO_F_seg1.mp3'),
    weather_rain_1_seg2: require('../../assets/audio/male_f/G01_weather_rain_01_MATTEO_F_seg2.mp3'),
    weather_rain_2_seg1: require('../../assets/audio/male_f/G01_weather_rain_02_MATTEO_F_seg1.mp3'),
    weather_rain_2_seg2: require('../../assets/audio/male_f/G01_weather_rain_02_MATTEO_F_seg2.mp3'),
    weather_rain_3: require('../../assets/audio/male_f/G01_weather_rain_03_MATTEO_F.mp3'),
    weather_cold_1: require('../../assets/audio/male_f/G02_weather_cold_01_MATTEO_F.mp3'),
    weather_cold_2: require('../../assets/audio/male_f/G02_weather_cold_02_MATTEO_F.mp3'),
    weather_cold_3_seg1: require('../../assets/audio/male_f/G02_weather_cold_03_MATTEO_F_seg1.mp3'),
    weather_cold_3_seg2: require('../../assets/audio/male_f/G02_weather_cold_03_MATTEO_F_seg2.mp3'),
    weather_heat_1: require('../../assets/audio/male_f/G03_weather_hot_01_MATTEO_F.mp3'),
    weather_heat_2: require('../../assets/audio/male_f/G03_weather_hot_02_MATTEO_F.mp3'),
    weather_heat_3_seg1: require('../../assets/audio/male_f/G03_weather_hot_03_MATTEO_F_seg1.mp3'),
    weather_heat_3_seg2: require('../../assets/audio/male_f/G03_weather_hot_03_MATTEO_F_seg2.mp3'),
    weather_heat_4_seg1: require('../../assets/audio/male_f/G03_weather_hot_04_MATTEO_F_seg1.mp3'),
    weather_heat_4_seg2: require('../../assets/audio/male_f/G03_weather_hot_04_MATTEO_F_seg2.mp3'),
    weather_wind_1_seg1: require('../../assets/audio/male_f/G04_weather_wind_01_MATTEO_F_seg1.mp3'),
    weather_wind_1_seg2: require('../../assets/audio/male_f/G04_weather_wind_01_MATTEO_F_seg2.mp3'),
    weather_wind_2: require('../../assets/audio/male_f/G04_weather_wind_02_MATTEO_F.mp3'),
    weather_wind_3: require('../../assets/audio/male_f/G04_weather_wind_03_MATTEO_F.mp3'),
    time_predawn_1: require('../../assets/audio/male_f/H01_time_predawn_01_MATTEO_F.mp3'),
    time_predawn_2_seg1: require('../../assets/audio/male_f/H01_time_predawn_02_MATTEO_F_seg1.mp3'),
    time_predawn_2_seg2: require('../../assets/audio/male_f/H01_time_predawn_02_MATTEO_F_seg2.mp3'),
    time_predawn_3_seg1: require('../../assets/audio/male_f/H01_time_predawn_03_MATTEO_F_seg1.mp3'),
    time_predawn_3_seg2: require('../../assets/audio/male_f/H01_time_predawn_03_MATTEO_F_seg2.mp3'),
    time_dawn_1_seg1: require('../../assets/audio/male_f/H02_time_dawn_01_MATTEO_F_seg1.mp3'),
    time_dawn_1_seg2: require('../../assets/audio/male_f/H02_time_dawn_01_MATTEO_F_seg2.mp3'),
    time_dawn_2: require('../../assets/audio/male_f/H02_time_dawn_02_MATTEO_F.mp3'),
    time_dawn_3_seg1: require('../../assets/audio/male_f/H02_time_dawn_03_MATTEO_F_seg1.mp3'),
    time_dawn_3_seg2: require('../../assets/audio/male_f/H02_time_dawn_03_MATTEO_F_seg2.mp3'),
    time_lunch_1_seg1: require('../../assets/audio/male_f/H03_time_lunch_01_MATTEO_F_seg1.mp3'),
    time_lunch_1_seg2: require('../../assets/audio/male_f/H03_time_lunch_01_MATTEO_F_seg2.mp3'),
    time_lunch_2: require('../../assets/audio/male_f/H03_time_lunch_02_MATTEO_F.mp3'),
    time_lunch_3_seg1: require('../../assets/audio/male_f/H03_time_lunch_03_MATTEO_F_seg1.mp3'),
    time_lunch_3_seg2: require('../../assets/audio/male_f/H03_time_lunch_03_MATTEO_F_seg2.mp3'),
    time_sunset_1_seg1: require('../../assets/audio/male_f/H04_time_sunset_01_MATTEO_F_seg1.mp3'),
    time_sunset_2_seg1: require('../../assets/audio/male_f/H04_time_sunset_02_MATTEO_F_seg1.mp3'),
    time_sunset_3_seg1: require('../../assets/audio/male_f/H04_time_sunset_03_MATTEO_F_seg1.mp3'),
    time_sunset_3_seg2: require('../../assets/audio/male_f/H04_time_sunset_03_MATTEO_F_seg2.mp3'),
    time_night_1_seg1: require('../../assets/audio/male_f/H05_time_night_01_MATTEO_F_seg1.mp3'),
    time_night_1_seg2: require('../../assets/audio/male_f/H05_time_night_01_MATTEO_F_seg2.mp3'),
    time_night_2: require('../../assets/audio/male_f/H05_time_night_02_MATTEO_F.mp3'),
    time_night_3_seg1: require('../../assets/audio/male_f/H05_time_night_03_MATTEO_F_seg1.mp3'),
    time_night_3_seg2: require('../../assets/audio/male_f/H05_time_night_03_MATTEO_F_seg2.mp3'),
    record_distance_1_seg1: require('../../assets/audio/male_f/I01_record_distance_01_MATTEO_F_seg1.mp3'),
    record_distance_1_seg2: require('../../assets/audio/male_f/I01_record_distance_01_MATTEO_F_seg2.mp3'),
    record_distance_2_seg1: require('../../assets/audio/male_f/I01_record_distance_02_MATTEO_F_seg1.mp3'),
    record_distance_2_seg2: require('../../assets/audio/male_f/I01_record_distance_02_MATTEO_F_seg2.mp3'),
    record_distance_3_seg1: require('../../assets/audio/male_f/I01_record_distance_03_MATTEO_F_seg1.mp3'),
    record_distance_3_seg2: require('../../assets/audio/male_f/I01_record_distance_03_MATTEO_F_seg2.mp3'),
    record_speed_1_seg1: require('../../assets/audio/male_f/I02_record_speed_01_MATTEO_F_seg1.mp3'),
    record_speed_1_seg2: require('../../assets/audio/male_f/I02_record_speed_01_MATTEO_F_seg2.mp3'),
    record_speed_2_seg1: require('../../assets/audio/male_f/I02_record_speed_02_MATTEO_F_seg1.mp3'),
    record_speed_2_seg2: require('../../assets/audio/male_f/I02_record_speed_02_MATTEO_F_seg2.mp3'),
    record_speed_3_seg1: require('../../assets/audio/male_f/I02_record_speed_03_MATTEO_F_seg1.mp3'),
    record_speed_3_seg2: require('../../assets/audio/male_f/I02_record_speed_03_MATTEO_F_seg2.mp3'),
    record_steps_1_seg1: require('../../assets/audio/male_f/I03_record_steps_01_MATTEO_F_seg1.mp3'),
    record_steps_1_seg2: require('../../assets/audio/male_f/I03_record_steps_01_MATTEO_F_seg2.mp3'),
    record_steps_2_seg1: require('../../assets/audio/male_f/I03_record_steps_02_MATTEO_F_seg1.mp3'),
    record_steps_2_seg2: require('../../assets/audio/male_f/I03_record_steps_02_MATTEO_F_seg2.mp3'),
    record_steps_3_seg1: require('../../assets/audio/male_f/I03_record_steps_03_MATTEO_F_seg1.mp3'),
    record_steps_3_seg2: require('../../assets/audio/male_f/I03_record_steps_03_MATTEO_F_seg2.mp3'),
    record_duration_1_seg1: require('../../assets/audio/male_f/I04_record_duration_01_MATTEO_F_seg1.mp3'),
    record_duration_1_seg2: require('../../assets/audio/male_f/I04_record_duration_01_MATTEO_F_seg2.mp3'),
    record_duration_2_seg1: require('../../assets/audio/male_f/I04_record_duration_02_MATTEO_F_seg1.mp3'),
    record_duration_2_seg2: require('../../assets/audio/male_f/I04_record_duration_02_MATTEO_F_seg2.mp3'),
    record_duration_3_seg1: require('../../assets/audio/male_f/I04_record_duration_03_MATTEO_F_seg1.mp3'),
    record_duration_3_seg2: require('../../assets/audio/male_f/I04_record_duration_03_MATTEO_F_seg2.mp3'),
    streak_3_1_seg1: require('../../assets/audio/male_f/L01_streak_3_01_MATTEO_F_seg1.mp3'),
    streak_3_1_seg2: require('../../assets/audio/male_f/L01_streak_3_01_MATTEO_F_seg2.mp3'),
    streak_3_2_seg1: require('../../assets/audio/male_f/L01_streak_3_02_MATTEO_F_seg1.mp3'),
    streak_3_2_seg2: require('../../assets/audio/male_f/L01_streak_3_02_MATTEO_F_seg2.mp3'),
    streak_3_3_seg1: require('../../assets/audio/male_f/L01_streak_3_03_MATTEO_F_seg1.mp3'),
    streak_3_3_seg2: require('../../assets/audio/male_f/L01_streak_3_03_MATTEO_F_seg2.mp3'),
    streak_14_1_seg1: require('../../assets/audio/male_f/L02_streak_14_01_MATTEO_F_seg1.mp3'),
    streak_14_1_seg2: require('../../assets/audio/male_f/L02_streak_14_01_MATTEO_F_seg2.mp3'),
    streak_14_2_seg1: require('../../assets/audio/male_f/L02_streak_14_02_MATTEO_F_seg1.mp3'),
    streak_14_2_seg2: require('../../assets/audio/male_f/L02_streak_14_02_MATTEO_F_seg2.mp3'),
    streak_14_3_seg1: require('../../assets/audio/male_f/L02_streak_14_03_MATTEO_F_seg1.mp3'),
    streak_14_3_seg2: require('../../assets/audio/male_f/L02_streak_14_03_MATTEO_F_seg2.mp3'),
    streak_30_1_seg1: require('../../assets/audio/male_f/L03_streak_30_01_MATTEO_F_seg1.mp3'),
    streak_30_1_seg2: require('../../assets/audio/male_f/L03_streak_30_01_MATTEO_F_seg2.mp3'),
    streak_30_2_seg1: require('../../assets/audio/male_f/L03_streak_30_02_MATTEO_F_seg1.mp3'),
    streak_30_2_seg2: require('../../assets/audio/male_f/L03_streak_30_02_MATTEO_F_seg2.mp3'),
    streak_30_3_seg1: require('../../assets/audio/male_f/L03_streak_30_03_MATTEO_F_seg1.mp3'),
    streak_30_3_seg2: require('../../assets/audio/male_f/L03_streak_30_03_MATTEO_F_seg2.mp3'),
    comeback_short_1_seg1: require('../../assets/audio/male_f/L04_comeback_short_01_MATTEO_F_seg1.mp3'),
    comeback_short_1_seg2: require('../../assets/audio/male_f/L04_comeback_short_01_MATTEO_F_seg2.mp3'),
    comeback_short_2: require('../../assets/audio/male_f/L04_comeback_short_02_MATTEO_F.mp3'),
    comeback_short_3_seg1: require('../../assets/audio/male_f/L04_comeback_short_03_MATTEO_F_seg1.mp3'),
    comeback_short_3_seg2: require('../../assets/audio/male_f/L04_comeback_short_03_MATTEO_F_seg2.mp3'),
    comeback_long_1_seg1: require('../../assets/audio/male_f/L05_comeback_long_01_MATTEO_F_seg1.mp3'),
    comeback_long_1_seg2: require('../../assets/audio/male_f/L05_comeback_long_01_MATTEO_F_seg2.mp3'),
    comeback_long_2: require('../../assets/audio/male_f/L05_comeback_long_02_MATTEO_F.mp3'),
    comeback_long_3_seg1: require('../../assets/audio/male_f/L05_comeback_long_03_MATTEO_F_seg1.mp3'),
    comeback_long_3_seg2: require('../../assets/audio/male_f/L05_comeback_long_03_MATTEO_F_seg2.mp3'),
    science_cal_1_seg1: require('../../assets/audio/male_f/N01_science_cal_01_MATTEO_F_seg1.mp3'),
    science_cal_1_seg2: require('../../assets/audio/male_f/N01_science_cal_01_MATTEO_F_seg2.mp3'),
    science_cal_2: require('../../assets/audio/male_f/N01_science_cal_02_MATTEO_F.mp3'),
    science_cal_3: require('../../assets/audio/male_f/N01_science_cal_03_MATTEO_F.mp3'),
    science_heart_1_seg1: require('../../assets/audio/male_f/N02_science_heart_01_MATTEO_F_seg1.mp3'),
    science_heart_2: require('../../assets/audio/male_f/N02_science_heart_02_MATTEO_F.mp3'),
    science_heart_3: require('../../assets/audio/male_f/N02_science_heart_03_MATTEO_F.mp3'),
    science_metab_1: require('../../assets/audio/male_f/N03_science_metab_01_MATTEO_F.mp3'),
    science_metab_2: require('../../assets/audio/male_f/N03_science_metab_02_MATTEO_F.mp3'),
    science_metab_3_seg1: require('../../assets/audio/male_f/N03_science_metab_03_MATTEO_F_seg1.mp3'),
    science_sleep_1_seg1: require('../../assets/audio/male_f/N04_science_sleep_01_MATTEO_F_seg1.mp3'),
    science_sleep_1_seg2: require('../../assets/audio/male_f/N04_science_sleep_01_MATTEO_F_seg2.mp3'),
    science_sleep_2: require('../../assets/audio/male_f/N04_science_sleep_02_MATTEO_F.mp3'),
    science_sleep_3_seg1: require('../../assets/audio/male_f/N04_science_sleep_03_MATTEO_F_seg1.mp3'),
    science_sleep_3_seg2: require('../../assets/audio/male_f/N04_science_sleep_03_MATTEO_F_seg2.mp3'),
    science_mood_1: require('../../assets/audio/male_f/N05_science_mood_01_MATTEO_F.mp3'),
    science_mood_2_seg1: require('../../assets/audio/male_f/N05_science_mood_02_MATTEO_F_seg1.mp3'),
    science_mood_2_seg2: require('../../assets/audio/male_f/N05_science_mood_02_MATTEO_F_seg2.mp3'),
    science_mood_3: require('../../assets/audio/male_f/N05_science_mood_03_MATTEO_F.mp3'),
    science_body_1: require('../../assets/audio/male_f/N06_science_posture_01_MATTEO_F.mp3'),
    science_body_2_seg1: require('../../assets/audio/male_f/N06_science_posture_02_MATTEO_F_seg1.mp3'),
    science_body_2_seg2: require('../../assets/audio/male_f/N06_science_posture_02_MATTEO_F_seg2.mp3'),
    science_body_3: require('../../assets/audio/male_f/N06_science_posture_03_MATTEO_F.mp3'),
    uphill_1_seg1: require('../../assets/audio/male_f/O02_motivation_uphill_01_MATTEO_F_seg1.mp3'),
    uphill_1_seg2: require('../../assets/audio/male_f/O02_motivation_uphill_01_MATTEO_F_seg2.mp3'),
    uphill_2_seg1: require('../../assets/audio/male_f/O02_motivation_uphill_02_MATTEO_F_seg1.mp3'),
    uphill_2_seg2: require('../../assets/audio/male_f/O02_motivation_uphill_02_MATTEO_F_seg2.mp3'),
    uphill_3_seg1: require('../../assets/audio/male_f/O02_motivation_uphill_03_MATTEO_F_seg1.mp3'),
    uphill_3_seg2: require('../../assets/audio/male_f/O02_motivation_uphill_03_MATTEO_F_seg2.mp3'),
    milestone_1km_1_seg1: require('../../assets/audio/male_f/A01_milestone_1km_01_MATTEO_F_seg1.mp3'),
    milestone_1km_1_seg2: require('../../assets/audio/male_f/A01_milestone_1km_01_MATTEO_F_seg2.mp3'),
    milestone_1km_2_seg1: require('../../assets/audio/male_f/A01_milestone_1km_02_MATTEO_F_seg1.mp3'),
    milestone_1km_2_seg2: require('../../assets/audio/male_f/A01_milestone_1km_02_MATTEO_F_seg2.mp3'),
    milestone_1km_3_seg1: require('../../assets/audio/male_f/A01_milestone_1km_03_MATTEO_F_seg1.mp3'),
    milestone_1km_3_seg2: require('../../assets/audio/male_f/A01_milestone_1km_03_MATTEO_F_seg2.mp3'),
    milestone_2km_1_seg1: require('../../assets/audio/male_f/A02_milestone_2km_01_MATTEO_F_seg1.mp3'),
    milestone_2km_1_seg2: require('../../assets/audio/male_f/A02_milestone_2km_01_MATTEO_F_seg2.mp3'),
    milestone_2km_2_seg1: require('../../assets/audio/male_f/A02_milestone_2km_02_MATTEO_F_seg1.mp3'),
    milestone_2km_2_seg2: require('../../assets/audio/male_f/A02_milestone_2km_02_MATTEO_F_seg2.mp3'),
    milestone_2km_3_seg1: require('../../assets/audio/male_f/A02_milestone_2km_03_MATTEO_F_seg1.mp3'),
    milestone_2km_3_seg2: require('../../assets/audio/male_f/A02_milestone_2km_03_MATTEO_F_seg2.mp3'),
    milestone_3km_1_seg1: require('../../assets/audio/male_f/A03_milestone_3km_01_MATTEO_F_seg1.mp3'),
    milestone_3km_1_seg2: require('../../assets/audio/male_f/A03_milestone_3km_01_MATTEO_F_seg2.mp3'),
    milestone_3km_2_seg1: require('../../assets/audio/male_f/A03_milestone_3km_02_MATTEO_F_seg1.mp3'),
    milestone_3km_2_seg2: require('../../assets/audio/male_f/A03_milestone_3km_02_MATTEO_F_seg2.mp3'),
    milestone_3km_3_seg1: require('../../assets/audio/male_f/A03_milestone_3km_03_MATTEO_F_seg1.mp3'),
    milestone_3km_3_seg2: require('../../assets/audio/male_f/A03_milestone_3km_03_MATTEO_F_seg2.mp3'),
    milestone_4km_1_seg1: require('../../assets/audio/male_f/A04_milestone_4km_01_MATTEO_F_seg1.mp3'),
    milestone_4km_1_seg2: require('../../assets/audio/male_f/A04_milestone_4km_01_MATTEO_F_seg2.mp3'),
    milestone_4km_2_seg1: require('../../assets/audio/male_f/A04_milestone_4km_02_MATTEO_F_seg1.mp3'),
    milestone_4km_2_seg2: require('../../assets/audio/male_f/A04_milestone_4km_02_MATTEO_F_seg2.mp3'),
    milestone_4km_3_seg1: require('../../assets/audio/male_f/A04_milestone_4km_03_MATTEO_F_seg1.mp3'),
    milestone_4km_3_seg2: require('../../assets/audio/male_f/A04_milestone_4km_03_MATTEO_F_seg2.mp3'),
    milestone_5km_1_seg1: require('../../assets/audio/male_f/A05_milestone_5km_01_MATTEO_F_seg1.mp3'),
    milestone_5km_1_seg2: require('../../assets/audio/male_f/A05_milestone_5km_01_MATTEO_F_seg2.mp3'),
    milestone_5km_2_seg1: require('../../assets/audio/male_f/A05_milestone_5km_02_MATTEO_F_seg1.mp3'),
    milestone_5km_2_seg2: require('../../assets/audio/male_f/A05_milestone_5km_02_MATTEO_F_seg2.mp3'),
    milestone_5km_3_seg1: require('../../assets/audio/male_f/A05_milestone_5km_03_MATTEO_F_seg1.mp3'),
    milestone_5km_3_seg2: require('../../assets/audio/male_f/A05_milestone_5km_03_MATTEO_F_seg2.mp3'),
    quarter_done_1_seg1: require('../../assets/audio/male_f/B01_quarter_done_01_MATTEO_F_seg1.mp3'),
    quarter_done_1_seg2: require('../../assets/audio/male_f/B01_quarter_done_01_MATTEO_F_seg2.mp3'),
    quarter_done_2_seg1: require('../../assets/audio/male_f/B01_quarter_done_02_MATTEO_F_seg1.mp3'),
    quarter_done_2_seg2: require('../../assets/audio/male_f/B01_quarter_done_02_MATTEO_F_seg2.mp3'),
    quarter_done_3_seg1: require('../../assets/audio/male_f/B01_quarter_done_03_MATTEO_F_seg1.mp3'),
    quarter_done_3_seg2: require('../../assets/audio/male_f/B01_quarter_done_03_MATTEO_F_seg2.mp3'),
    halfway_1_seg1: require('../../assets/audio/male_f/B02_halfway_01_MATTEO_F_seg1.mp3'),
    halfway_1_seg2: require('../../assets/audio/male_f/B02_halfway_01_MATTEO_F_seg2.mp3'),
    halfway_2_seg1: require('../../assets/audio/male_f/B02_halfway_02_MATTEO_F_seg1.mp3'),
    halfway_2_seg2: require('../../assets/audio/male_f/B02_halfway_02_MATTEO_F_seg2.mp3'),
    halfway_3_seg1: require('../../assets/audio/male_f/B02_halfway_03_MATTEO_F_seg1.mp3'),
    halfway_3_seg2: require('../../assets/audio/male_f/B02_halfway_03_MATTEO_F_seg2.mp3'),
    halfway_4_seg1: require('../../assets/audio/male_f/B02_halfway_04_MATTEO_F_seg1.mp3'),
    halfway_4_seg2: require('../../assets/audio/male_f/B02_halfway_04_MATTEO_F_seg2.mp3'),
    three_quarters_1_seg1: require('../../assets/audio/male_f/B03_three_quarters_01_MATTEO_F_seg1.mp3'),
    three_quarters_1_seg2: require('../../assets/audio/male_f/B03_three_quarters_01_MATTEO_F_seg2.mp3'),
    three_quarters_2_seg1: require('../../assets/audio/male_f/B03_three_quarters_02_MATTEO_F_seg1.mp3'),
    three_quarters_2_seg2: require('../../assets/audio/male_f/B03_three_quarters_02_MATTEO_F_seg2.mp3'),
    three_quarters_3_seg1: require('../../assets/audio/male_f/B03_three_quarters_03_MATTEO_F_seg1.mp3'),
    three_quarters_3_seg2: require('../../assets/audio/male_f/B03_three_quarters_03_MATTEO_F_seg2.mp3'),
    last_min_cooldown_1_seg1: require('../../assets/audio/male_f/B04_last_min_cooldown_01_MATTEO_F_seg1.mp3'),
    last_min_cooldown_1_seg2: require('../../assets/audio/male_f/B04_last_min_cooldown_01_MATTEO_F_seg2.mp3'),
    last_min_cooldown_2_seg1: require('../../assets/audio/male_f/B04_last_min_cooldown_02_MATTEO_F_seg1.mp3'),
    last_min_cooldown_2_seg2: require('../../assets/audio/male_f/B04_last_min_cooldown_02_MATTEO_F_seg2.mp3'),
    last_min_cooldown_3_seg1: require('../../assets/audio/male_f/B04_last_min_cooldown_03_MATTEO_F_seg1.mp3'),
    last_min_cooldown_3_seg2: require('../../assets/audio/male_f/B04_last_min_cooldown_03_MATTEO_F_seg2.mp3'),
    workout_complete_1_seg1: require('../../assets/audio/male_f/B05_workout_complete_01_MATTEO_F_seg1.mp3'),
    workout_complete_1_seg2: require('../../assets/audio/male_f/B05_workout_complete_01_MATTEO_F_seg2.mp3'),
    workout_complete_2_seg1: require('../../assets/audio/male_f/B05_workout_complete_02_MATTEO_F_seg1.mp3'),
    workout_complete_2_seg2: require('../../assets/audio/male_f/B05_workout_complete_02_MATTEO_F_seg2.mp3'),
    workout_complete_3_seg1: require('../../assets/audio/male_f/B05_workout_complete_03_MATTEO_F_seg1.mp3'),
    workout_complete_3_seg2: require('../../assets/audio/male_f/B05_workout_complete_03_MATTEO_F_seg2.mp3'),
    workout_complete_4_seg1: require('../../assets/audio/male_f/B05_workout_complete_04_MATTEO_F_seg1.mp3'),
    workout_complete_4_seg2: require('../../assets/audio/male_f/B05_workout_complete_04_MATTEO_F_seg2.mp3'),
    badge_first_workout_1_seg1: require('../../assets/audio/male_f/B06_badge_first_workout_01_MATTEO_F_seg1.mp3'),
    badge_first_workout_1_seg2: require('../../assets/audio/male_f/B06_badge_first_workout_01_MATTEO_F_seg2.mp3'),
    badge_first_workout_2_seg1: require('../../assets/audio/male_f/B06_badge_first_workout_02_MATTEO_F_seg1.mp3'),
    badge_first_workout_2_seg2: require('../../assets/audio/male_f/B06_badge_first_workout_02_MATTEO_F_seg2.mp3'),
    badge_first_workout_3_seg1: require('../../assets/audio/male_f/B06_badge_first_workout_03_MATTEO_F_seg1.mp3'),
    badge_first_workout_3_seg2: require('../../assets/audio/male_f/B06_badge_first_workout_03_MATTEO_F_seg2.mp3'),
    badge_streak_7_1_seg1: require('../../assets/audio/male_f/B07_badge_streak_7_01_MATTEO_F_seg1.mp3'),
    badge_streak_7_1_seg2: require('../../assets/audio/male_f/B07_badge_streak_7_01_MATTEO_F_seg2.mp3'),
    badge_streak_7_2_seg1: require('../../assets/audio/male_f/B07_badge_streak_7_02_MATTEO_F_seg1.mp3'),
    badge_streak_7_2_seg2: require('../../assets/audio/male_f/B07_badge_streak_7_02_MATTEO_F_seg2.mp3'),
    badge_streak_7_3_seg1: require('../../assets/audio/male_f/B07_badge_streak_7_03_MATTEO_F_seg1.mp3'),
    badge_streak_7_3_seg2: require('../../assets/audio/male_f/B07_badge_streak_7_03_MATTEO_F_seg2.mp3'),
    badge_10k_steps_1_seg1: require('../../assets/audio/male_f/B08_badge_10k_steps_01_MATTEO_F_seg1.mp3'),
    badge_10k_steps_1_seg2: require('../../assets/audio/male_f/B08_badge_10k_steps_01_MATTEO_F_seg2.mp3'),
    badge_10k_steps_2_seg1: require('../../assets/audio/male_f/B08_badge_10k_steps_02_MATTEO_F_seg1.mp3'),
    badge_10k_steps_2_seg2: require('../../assets/audio/male_f/B08_badge_10k_steps_02_MATTEO_F_seg2.mp3'),
    badge_10k_steps_3_seg1: require('../../assets/audio/male_f/B08_badge_10k_steps_03_MATTEO_F_seg1.mp3'),
    badge_10k_steps_3_seg2: require('../../assets/audio/male_f/B08_badge_10k_steps_03_MATTEO_F_seg2.mp3'),
    badge_5km_total_1_seg1: require('../../assets/audio/male_f/B09_badge_5km_total_01_MATTEO_F_seg1.mp3'),
    badge_5km_total_1_seg2: require('../../assets/audio/male_f/B09_badge_5km_total_01_MATTEO_F_seg2.mp3'),
    badge_5km_total_2_seg1: require('../../assets/audio/male_f/B09_badge_5km_total_02_MATTEO_F_seg1.mp3'),
    badge_5km_total_2_seg2: require('../../assets/audio/male_f/B09_badge_5km_total_02_MATTEO_F_seg2.mp3'),
    badge_5km_total_3_seg1: require('../../assets/audio/male_f/B09_badge_5km_total_03_MATTEO_F_seg1.mp3'),
    badge_5km_total_3_seg2: require('../../assets/audio/male_f/B09_badge_5km_total_03_MATTEO_F_seg2.mp3'),
    badge_full_week_1_seg1: require('../../assets/audio/male_f/B10_badge_full_week_01_MATTEO_F_seg1.mp3'),
    badge_full_week_1_seg2: require('../../assets/audio/male_f/B10_badge_full_week_01_MATTEO_F_seg2.mp3'),
    badge_full_week_2_seg1: require('../../assets/audio/male_f/B10_badge_full_week_02_MATTEO_F_seg1.mp3'),
    badge_full_week_2_seg2: require('../../assets/audio/male_f/B10_badge_full_week_02_MATTEO_F_seg2.mp3'),
    badge_full_week_3_seg1: require('../../assets/audio/male_f/B10_badge_full_week_03_MATTEO_F_seg1.mp3'),
    badge_full_week_3_seg2: require('../../assets/audio/male_f/B10_badge_full_week_03_MATTEO_F_seg2.mp3'),
    badge_speed_demon_1_seg1: require('../../assets/audio/male_f/B11_badge_speed_demon_01_MATTEO_F_seg1.mp3'),
    badge_speed_demon_1_seg2: require('../../assets/audio/male_f/B11_badge_speed_demon_01_MATTEO_F_seg2.mp3'),
    badge_speed_demon_2_seg1: require('../../assets/audio/male_f/B11_badge_speed_demon_02_MATTEO_F_seg1.mp3'),
    badge_speed_demon_2_seg2: require('../../assets/audio/male_f/B11_badge_speed_demon_02_MATTEO_F_seg2.mp3'),
    badge_speed_demon_3_seg1: require('../../assets/audio/male_f/B11_badge_speed_demon_03_MATTEO_F_seg1.mp3'),
    badge_speed_demon_3_seg2: require('../../assets/audio/male_f/B11_badge_speed_demon_03_MATTEO_F_seg2.mp3'),
    badge_goal_reached_1_seg1: require('../../assets/audio/male_f/B12_badge_goal_reached_01_MATTEO_F_seg1.mp3'),
    badge_goal_reached_1_seg2: require('../../assets/audio/male_f/B12_badge_goal_reached_01_MATTEO_F_seg2.mp3'),
    badge_goal_reached_2_seg1: require('../../assets/audio/male_f/B12_badge_goal_reached_02_MATTEO_F_seg1.mp3'),
    badge_goal_reached_2_seg2: require('../../assets/audio/male_f/B12_badge_goal_reached_02_MATTEO_F_seg2.mp3'),
    badge_goal_reached_3_seg1: require('../../assets/audio/male_f/B12_badge_goal_reached_03_MATTEO_F_seg1.mp3'),
    badge_goal_reached_3_seg2: require('../../assets/audio/male_f/B12_badge_goal_reached_03_MATTEO_F_seg2.mp3'),
    invalid_workout_1: require('../../assets/audio/male_f/B13_invalid_workout_01_MATTEO_F.mp3'),
    invalid_workout_2: require('../../assets/audio/male_f/B13_invalid_workout_02_MATTEO_F.mp3'),
    invalid_workout_3: require('../../assets/audio/male_f/B13_invalid_workout_03_MATTEO_F.mp3'),
    pause_1: require('../../assets/audio/male_f/B14_pause_01_MATTEO_F.mp3'),
    pause_2: require('../../assets/audio/male_f/B14_pause_02_MATTEO_F.mp3'),
    pause_3: require('../../assets/audio/male_f/B14_pause_03_MATTEO_F.mp3'),
    resume_1: require('../../assets/audio/male_f/B15_resume_01_MATTEO_F.mp3'),
    resume_2: require('../../assets/audio/male_f/B15_resume_02_MATTEO_F.mp3'),
    resume_3: require('../../assets/audio/male_f/B15_resume_03_MATTEO_F.mp3'),
    Q01_duration_01: require('../../assets/audio/male_f/Q01_duration_01_MATTEO_F.mp3'),
    Q01_duration_02: require('../../assets/audio/male_f/Q01_duration_02_MATTEO_F.mp3'),
    Q01_duration_03: require('../../assets/audio/male_f/Q01_duration_03_MATTEO_F.mp3'),
    Q01_duration_04: require('../../assets/audio/male_f/Q01_duration_04_MATTEO_F.mp3'),
    Q01_duration_05: require('../../assets/audio/male_f/Q01_duration_05_MATTEO_F.mp3'),
    Q01_duration_06: require('../../assets/audio/male_f/Q01_duration_06_MATTEO_F.mp3'),
    Q01_duration_07: require('../../assets/audio/male_f/Q01_duration_07_MATTEO_F.mp3'),
    Q01_duration_08: require('../../assets/audio/male_f/Q01_duration_08_MATTEO_F.mp3'),
    Q01_duration_09: require('../../assets/audio/male_f/Q01_duration_09_MATTEO_F.mp3'),
    Q01_duration_10: require('../../assets/audio/male_f/Q01_duration_10_MATTEO_F.mp3'),
    Q01_duration_11: require('../../assets/audio/male_f/Q01_duration_11_MATTEO_F.mp3'),
    Q01_duration_12: require('../../assets/audio/male_f/Q01_duration_12_MATTEO_F.mp3'),
    Q01_duration_13: require('../../assets/audio/male_f/Q01_duration_13_MATTEO_F.mp3'),
    Q01_duration_14: require('../../assets/audio/male_f/Q01_duration_14_MATTEO_F.mp3'),
    Q01_duration_15: require('../../assets/audio/male_f/Q01_duration_15_MATTEO_F.mp3'),
    warmup_announce_01_seg1: require('../../assets/audio/male_f/Q02_warmup_announce_01_MATTEO_F_seg1.mp3'),
    warmup_announce_01_seg2: require('../../assets/audio/male_f/Q02_warmup_announce_01_MATTEO_F_seg2.mp3'),
    warmup_announce_02_seg1: require('../../assets/audio/male_f/Q02_warmup_announce_02_MATTEO_F_seg1.mp3'),
    warmup_announce_02_seg2: require('../../assets/audio/male_f/Q02_warmup_announce_02_MATTEO_F_seg2.mp3'),
    warmup_announce_03_seg1: require('../../assets/audio/male_f/Q02_warmup_announce_03_MATTEO_F_seg1.mp3'),
    warmup_announce_03_seg2: require('../../assets/audio/male_f/Q02_warmup_announce_03_MATTEO_F_seg2.mp3'),
    moderate_announce_01_seg1: require('../../assets/audio/male_f/Q03_moderate_announce_01_MATTEO_F_seg1.mp3'),
    moderate_announce_01_seg2: require('../../assets/audio/male_f/Q03_moderate_announce_01_MATTEO_F_seg2.mp3'),
    moderate_announce_02_seg1: require('../../assets/audio/male_f/Q03_moderate_announce_02_MATTEO_F_seg1.mp3'),
    moderate_announce_02_seg2: require('../../assets/audio/male_f/Q03_moderate_announce_02_MATTEO_F_seg2.mp3'),
    moderate_announce_03_seg1: require('../../assets/audio/male_f/Q03_moderate_announce_03_MATTEO_F_seg1.mp3'),
    moderate_announce_03_seg2: require('../../assets/audio/male_f/Q03_moderate_announce_03_MATTEO_F_seg2.mp3'),
    fast_announce_01_seg1: require('../../assets/audio/male_f/Q04_fast_announce_01_MATTEO_F_seg1.mp3'),
    fast_announce_01_seg2: require('../../assets/audio/male_f/Q04_fast_announce_01_MATTEO_F_seg2.mp3'),
    fast_announce_02_seg1: require('../../assets/audio/male_f/Q04_fast_announce_02_MATTEO_F_seg1.mp3'),
    fast_announce_02_seg2: require('../../assets/audio/male_f/Q04_fast_announce_02_MATTEO_F_seg2.mp3'),
    fast_announce_03_seg1: require('../../assets/audio/male_f/Q04_fast_announce_03_MATTEO_F_seg1.mp3'),
    fast_announce_03_seg2: require('../../assets/audio/male_f/Q04_fast_announce_03_MATTEO_F_seg2.mp3'),
    fast_announce_04_seg1: require('../../assets/audio/male_f/Q04_fast_announce_04_MATTEO_F_seg1.mp3'),
    fast_announce_04_seg2: require('../../assets/audio/male_f/Q04_fast_announce_04_MATTEO_F_seg2.mp3'),
    cooldown_announce_01_seg1: require('../../assets/audio/male_f/Q05_cooldown_announce_01_MATTEO_F_seg1.mp3'),
    cooldown_announce_01_seg2: require('../../assets/audio/male_f/Q05_cooldown_announce_01_MATTEO_F_seg2.mp3'),
    cooldown_announce_02_seg1: require('../../assets/audio/male_f/Q05_cooldown_announce_02_MATTEO_F_seg1.mp3'),
    cooldown_announce_02_seg2: require('../../assets/audio/male_f/Q05_cooldown_announce_02_MATTEO_F_seg2.mp3'),
    cooldown_announce_03_seg1: require('../../assets/audio/male_f/Q05_cooldown_announce_03_MATTEO_F_seg1.mp3'),
    cooldown_announce_03_seg2: require('../../assets/audio/male_f/Q05_cooldown_announce_03_MATTEO_F_seg2.mp3'),
  },
};


const AUDIO_VARIANT_COUNT: { [cat: string]: number } = {
  // ── Vecchi file (D/O/C/E/F/G/H/I/L/N series) ──
  workout_start: 3, interval_fast: 4, interval_moderate: 3, cooldown: 3,
  motivation_random: 4,
  badge_rain_walker: 3, badge_ice_walker: 3, badge_heat_warrior: 3, badge_wind_rider: 3,
  badge_early_bird: 3, badge_night_owl: 3, badge_all_weather: 3, badge_unstoppable: 3,
  badge_dawn_patrol: 3, badge_sunset_lover: 3, badge_lunch_hero: 3, badge_four_seasons: 3,
  streak_3: 3, streak_14: 3, streak_30: 3,
  comeback_short: 3, comeback_long: 3,
  record_distance: 3, record_speed: 3, record_steps: 3, record_duration: 3,
  weather_rain: 3, weather_cold: 3, weather_heat: 4, weather_wind: 3,
  time_predawn: 3, time_dawn: 3, time_lunch: 3, time_sunset: 3, time_night: 3,
  speed_too_slow: 3, speed_good: 3, speed_fast: 3,
  body_hydration: 4, body_posture: 4, body_breathing: 4, body_cadence: 3,
  science_cal: 3, science_heart: 3, science_metab: 3,
  science_sleep: 3, science_mood: 3, science_body: 3,
  uphill: 3,
  // ── Nuovi file v6 (Q/A/B series) ──
  // Q: annunci fase + durate
  warmup_announce: 3, moderate_announce: 3, fast_announce: 4, cooldown_announce: 3,
  // A: milestone km
  milestone_1km: 3, milestone_2km: 3, milestone_3km: 3, milestone_4km: 3, milestone_5km: 3,
  // B: progresso + fine + badge + utility
  quarter_done: 3, halfway: 4, three_quarters: 3,
  last_min_cooldown: 3, workout_complete: 4,
  badge_first_workout: 3, badge_streak_7: 3, badge_10k_steps: 3,
  badge_5km_total: 3, badge_full_week: 3, badge_speed_demon: 3, badge_goal_reached: 3,
  invalid_workout: 3, pause: 3, resume: 3,
};

// Mappa durata in minuti → indice file Q01 (arrotondato al minuto intero più vicino disponibile)
const DURATION_FILE_INDEX: { [minutes: number]: number } = {
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8,
  10: 9, 15: 10, 18: 11, 20: 12, 22: 13, 25: 14, 28: 15,
};

// Restituisce l'indice Q01 per una durata in minuti (arrotonda al valore disponibile più vicino)
const getDurationFileIndex = (minutes: number): number => {
  const available = [1,2,3,4,5,6,7,8,10,15,18,20,22,25,28];
  const rounded = Math.round(minutes);
  const closest = available.reduce((prev, curr) =>
    Math.abs(curr - rounded) < Math.abs(prev - rounded) ? curr : prev
  );
  return DURATION_FILE_INDEX[closest] ?? 1;
};

// Type definitions
interface UserProfile {
  name: string;
  age: number;
  gender: 'M' | 'F' | '';
  weight: number;
  height: number;
  targetWeight: number;
  trainingDays: number[];
  fitnessLevel: 'beginner' | 'intermediate' | 'advanced' | '';
  weightLossSpeed: 'moderate' | 'standard' | '';
  startDate?: string;
  voicePreference?: 'female' | 'male';
  showVideoPreview?: boolean;
}

interface WorkoutInterval {
  type: 'warmup' | 'walking' | 'cooldown';
  duration: number;
  speed: 'slow' | 'moderate' | 'fast';
  name: string;
  color: string;
}

interface WeeklyProgram {
  week: number;
  totalDuration: number;
  intervals: WorkoutInterval[];
  estimatedCalories: number;
  coveragePercent: number;
}

interface RouteCoordinate {
  latitude: number;
  longitude: number;
}

interface WorkoutRecord {
  date: string;
  duration: number;
  distance: string;
  pace: string;
  steps: number;
  cadence: number;
  route: RouteCoordinate[];
  calories: number;
  weather?: WeatherData;
}

// ============= WEATHER & ENVIRONMENT =============
interface WeatherData {
  weather: string;         // clear, clouds, rain, snow, thunderstorm, drizzle, mist, fog
  temp_c: number;
  humidity: number;
  wind_kmh: number;
  sunrise: string;         // "07:12"
  sunset: string;          // "17:48"
  local_time: string;      // "06:45"
  is_dark: boolean;
  description: string;     // "pioggia leggera", "cielo sereno"
}

interface Badge {
  id: string;
  icon: string;
  title: string;           // English name
  tagline: string;         // Italian tagline
  description: string;
  category: 'fitness' | 'weather' | 'time';
  unlocked: boolean;
  unlockedDate?: string;
  progress: number;
  target: number;
}

interface WeightRecord {
  date: string;
  weight: number;
}

interface WaterRecord {
  date: string;
  glasses: number;
}

interface MonthlyGoal {
  id: string;
  title: string;
  icon: string;
  target: number;
  current: number;
  unit: string;
  month: string; // 'YYYY-MM'
}

interface SavedRoute {
  id: string;
  name: string;
  date: string;
  route: RouteCoordinate[];
  distance: number; // km
}

interface UserLevel {
  xp: number;
  level: number;
  title: string;
}

// XP System
const XP_PER_ACTION = {
  workout_complete: 100,
  km_walked: 20,
  streak_day: 50,
  badge_unlock: 200,
  monthly_goal: 300,
  water_goal: 10,
  weight_update: 30,
};

const LEVEL_THRESHOLDS: { level: number; xp: number; title: string }[] = [
  { level: 1, xp: 0, title: 'Principiante' },
  { level: 2, xp: 300, title: 'Camminatore' },
  { level: 3, xp: 800, title: 'Esploratore' },
  { level: 4, xp: 1500, title: 'Maratoneta' },
  { level: 5, xp: 2500, title: 'Atleta' },
  { level: 6, xp: 4000, title: 'Campione' },
  { level: 7, xp: 6000, title: 'Leggenda' },
  { level: 8, xp: 9000, title: 'Maestro' },
  { level: 9, xp: 13000, title: 'Elite' },
  { level: 10, xp: 20000, title: 'FitWalker Supremo' },
];

// Guided Walk sessions
interface GuidedWalkSession {
  id: string;
  title: string;
  subtitle: string;
  duration: number; // minuti
  icon: string;
  color: string;
  cues: { minuteMark: number; messageId: string; text: string }[];
}

// Training plan types
type PlanType = 'weightloss' | 'cardio' | 'stress' | 'tonic' | 'energy';

interface TrainingPlan {
  id: PlanType;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  weeks: number;
  description: string;
}

interface NotificationPreferences {
  enabled: boolean;
  hour: number;
  minute: number;
}

// Consigli Nutrizione Mediterranea — Testi a cura di Luana Carone
const DAILY_TIPS: { icon: string; title: string; text: string; category: string }[] = [
  { icon: 'local-dining', title: 'L\'oro verde della tradizione', text: 'L\'olio extravergine d\'oliva è il cuore pulsante della dieta mediterranea. Ricco di polifenoli e acidi grassi monoinsaturi, dona sapore e benessere. Usalo a crudo per condire: è così che sprigiona tutte le sue proprietà.', category: 'grassi' },
  { icon: 'set-meal', title: 'Il mare nel piatto', text: 'Sgombri, sardine, alici: il pesce azzurro del Mediterraneo è un tesoro di Omega-3. La tradizione prevede di portarlo in tavola 2-3 volte a settimana, fresco e di stagione quando possibile.', category: 'proteine' },
  { icon: 'eco', title: 'Il colore nel piatto', text: 'Le verdure sono protagoniste di ogni pasto mediterraneo. Crude, cotte, di tutti i colori: ogni tonalità racconta nutrienti diversi. La varietà è il segreto per un\'alimentazione completa.', category: 'verdure' },
  { icon: 'grain', title: 'Cereali: l\'energia della terra', text: 'Pane integrale, pasta di grano duro, farro, orzo: i cereali integrali mediterranei rilasciano energia gradualmente. Sono il carburante perfetto per accompagnarti nelle tue camminate.', category: 'cereali' },
  { icon: 'water-drop', title: 'L\'acqua prima di tutto', text: 'L\'acqua è vita, soprattutto quando cammini. La tradizione mediterranea insegna a bere regolarmente durante il giorno. Durante l\'attività fisica, piccoli sorsi frequenti mantengono l\'idratazione ottimale.', category: 'acqua' },
  { icon: 'local-dining', title: 'I legumi della nonna', text: 'Lenticchie, ceci, fagioli: sono la memoria gastronomica del Mediterraneo. Proteine vegetali, fibre e tradizione in un unico piatto. La cucina mediterranea li celebra 2-3 volte a settimana.', category: 'proteine' },
  { icon: 'spa', title: 'La frutta secca: piccoli tesori', text: 'Una manciata quotidiana di noci, mandorle o nocciole (circa 30g) è un gesto antico e saggio. Grassi buoni, minerali e il gusto autentico della terra mediterranea.', category: 'grassi' },
  { icon: 'restaurant', title: 'La misura giusta', text: 'La cucina mediterranea non è solo ingredienti, ma anche equilibrio. Un pugno chiuso per i cereali, il palmo della mano per le proteine. La tradizione ci insegna che la moderazione è una forma di saggezza.', category: 'porzioni' },
  { icon: 'cake', title: 'Il dolce della festa', text: 'Nella dieta mediterranea i dolci sono momenti di festa, non abitudini quotidiane. La frutta fresca è il dessert naturale: dolce, colorata e ricca di vitamine.', category: 'zuccheri' },
  { icon: 'wine-bar', title: 'Il vino della convivialità', text: 'Un bicchiere di vino rosso ai pasti è parte della tradizione conviviale mediterranea. Non un obbligo, ma una scelta consapevole. La moderazione fa la differenza.', category: 'bevande' },
  { icon: 'egg', title: 'Le uova: semplicità proteica', text: 'Le uova sono da sempre nella cucina mediterranea: semplici, nutrienti, versatili. La tradizione le prevede 2-4 volte a settimana, preparate in mille modi diversi.', category: 'proteine' },
  { icon: 'local-florist', title: 'Aromi del Mediterraneo', text: 'Basilico, origano, rosmarino, aglio: gli aromi mediterranei sono la firma dei nostri piatti. Riducono il bisogno di sale e regalano profumi che parlano di sole e terra.', category: 'condimenti' },
  { icon: 'breakfast-dining', title: 'La colazione: il primo passo', text: 'Iniziare la giornata con una colazione completa è un rito mediterraneo. Yogurt, cereali, frutta fresca, pane integrale: energia buona per partire col piede giusto.', category: 'colazione' },
  { icon: 'dinner-dining', title: 'La cena: dolce chiusura', text: 'La sera, la tradizione mediterranea suggerisce leggerezza. Verdure, pesce o legumi, senza appesantirsi. Il riposo notturno ringrazia.', category: 'cena' },
  { icon: 'nature', title: 'Il ritmo delle stagioni', text: 'Frutta e verdura di stagione seguono il ritmo naturale della terra. Costano meno, hanno più sapore, più nutrienti. La natura sa di cosa abbiamo bisogno, mese dopo mese.', category: 'verdure' },
  { icon: 'self-improvement', title: 'Il tempo del pasto', text: 'Mangiare è un atto sacro nella cultura mediterranea. Masticare con calma, conversare, assaporare. Il cervello impiega 20 minuti per sentirsi sazio: dagli questo tempo.', category: 'abitudini' },
  { icon: 'local-grocery-store', title: 'Formaggi: piacere con misura', text: 'Parmigiano, pecorino, mozzarella: eccellenze italiane da gustare con consapevolezza. 2-3 porzioni settimanali bastano per goderne senza eccessi.', category: 'latticini' },
  { icon: 'restaurant-menu', title: 'La carne rossa: un\'eccezione', text: 'Nella piramide mediterranea, la carne rossa è in cima: massimo una volta a settimana. Carni bianche, pesce e legumi sono le proteine quotidiane della tradizione.', category: 'proteine' },
  { icon: 'local-dining', title: 'L\'armonia nel piatto', text: 'Metà verdure, un quarto proteine, un quarto cereali: questa è la geometria mediterranea del pasto equilibrato. Un\'immagine semplice per ricordare l\'equilibrio.', category: 'porzioni' },
  { icon: 'emoji-food-beverage', title: 'Lo spuntino saggio', text: 'Tra un pasto e l\'altro, la tradizione suggerisce frutta fresca, yogurt o frutta secca. Piccole pause di gusto autentico, lontano da confezioni industriali.', category: 'spuntini' },
  { icon: 'outdoor-grill', title: 'Cucinare con rispetto', text: 'Vapore, forno, griglia: le cotture mediterranee preservano i nutrienti e esaltano i sapori naturali. La frittura resta un piacere occasionale, non un\'abitudine.', category: 'cottura' },
];

// Equivalenze calorie/cibo dopo allenamento — Dati a cura di Luana Carone
const CALORIE_EQUIVALENCES: { name: string; kcal: number; icon: string }[] = [
  { name: 'un cornetto al bar', kcal: 280, icon: 'breakfast-dining' },
  { name: 'un cappuccino', kcal: 120, icon: 'local-cafe' },
  { name: 'un trancio di pizza margherita', kcal: 200, icon: 'local-pizza' },
  { name: 'un gelato artigianale (cono medio)', kcal: 220, icon: 'icecream' },
  { name: 'una brioche alla crema', kcal: 320, icon: 'bakery-dining' },
  { name: 'un caffè macchiato', kcal: 15, icon: 'local-cafe' },
  { name: 'un tramezzino al tonno', kcal: 250, icon: 'lunch-dining' },
  { name: 'una focaccia bianca (100g)', kcal: 270, icon: 'lunch-dining' },
  { name: 'un arancino siciliano', kcal: 350, icon: 'dinner-dining' },
  { name: 'una porzione di tiramisù', kcal: 400, icon: 'cake' },
  { name: 'un aperitivo Spritz + patatine', kcal: 300, icon: 'local-bar' },
  { name: 'pasta al pomodoro (80g)', kcal: 350, icon: 'dinner-dining' },
  { name: 'una banana', kcal: 90, icon: 'nutrition' },
  { name: 'una mela', kcal: 70, icon: 'nutrition' },
  { name: 'uno yogurt greco bianco (170g)', kcal: 100, icon: 'emoji-food-beverage' },
];

// ─── ELEVENLABS — CONFIGURAZIONE AUDIO NOME ───────────────────────────────
// ⚠️  Inserire qui la propria chiave API ElevenLabs
const ELEVENLABS_API_KEY = 'sk_d46641823b214f5d348b1f398bfaa6fba728519e556ec86c';

const ELEVENLABS_VOICE_IDS: Record<'male' | 'female', string> = {
  male:   'mgY992PKDHjoehNJZlb8',  // MATTEO
  female: '3987zir5YdXwkcuT4fFV',  // TAMMY
};

// Impostazioni voce per il nome: tono caldo e naturale, stile leggero
const ELEVENLABS_NAME_VOICE_SETTINGS = {
  model_id: 'eleven_v3',
  voice_settings: {
    stability: 0.55,
    similarity_boost: 0.75,
    style: 0.15,
    use_speaker_boost: true,
  },
};

// Helper: converte ArrayBuffer in stringa base64 per FileSystem.writeAsStringAsync
// Opera in blocchi da 8KB per evitare stack overflow con file MP3 grandi
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return btoa(binary);
};

export default function FitWalkApp() {
  // Navigation
  const [currentScreen, setCurrentScreen] = useState('welcome');
  const [onboardingStep, setOnboardingStep] = useState(1);
  
  // User profile data
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: '',
    age: 0,
    gender: '',
    weight: 0,
    height: 0,
    targetWeight: 0,
    trainingDays: [],
    fitnessLevel: '',
    weightLossSpeed: '',
    startDate: new Date().toISOString()
  });

  // Program data
  const [weeklyDeficit, setWeeklyDeficit] = useState(0);
  const [weeksToGoal, setWeeksToGoal] = useState(0);
  const [weeklyProgram, setWeeklyProgram] = useState<WeeklyProgram[]>([]);
  const [currentWeek, setCurrentWeek] = useState(1);
  
  // Workout session
  const [sessionData, setSessionData] = useState({
    phase: 'warmup',
    elapsed: 0,
    distance: 0,
    pace: 0,
    isActive: false,
    lastPosition: null as Location.LocationObjectCoords | null,
    currentSpeed: 0,
    currentIntervalIndex: 0,
    steps: 0,
    cadence: 0,
    route: [] as RouteCoordinate[],
    lastKmAnnounced: 0,
    realStartTime: 0
  });

  const [workoutHistory, setWorkoutHistory] = useState<WorkoutRecord[]>([]);
  const [weightHistory, setWeightHistory] = useState<WeightRecord[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [gpsAvailable, setGpsAvailable] = useState(false);
  const [pedometerAvailable, setPedometerAvailable] = useState(false);
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [currentWeather, setCurrentWeather] = useState<WeatherData | null>(null);
  const weatherRef = useRef<WeatherData | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [showPhasePreview, setShowPhasePreview] = useState(false);

  // v5.0: Nuove feature
  const [waterToday, setWaterToday] = useState(0);
  const [waterHistory, setWaterHistory] = useState<WaterRecord[]>([]);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>({ enabled: true, hour: 8, minute: 0 });
  const [showNutritionTips, setShowNutritionTips] = useState(true);
  const [showWeightPopup, setShowWeightPopup] = useState(false);
  const [weightInputValue, setWeightInputValue] = useState('');
  const [indoorMode, setIndoorMode] = useState(false);
  const [healthSyncEnabled, setHealthSyncEnabled] = useState(false);
  const [monthlyGoals, setMonthlyGoals] = useState<MonthlyGoal[]>([]);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [userLevel, setUserLevel] = useState<UserLevel>({ xp: 0, level: 1, title: 'Principiante' });
  const [activePlan, setActivePlan] = useState<PlanType>('weightloss');
  const [showGuidedWalks, setShowGuidedWalks] = useState(false);
  const [activeGuidedWalk, setActiveGuidedWalk] = useState<GuidedWalkSession | null>(null);

  // Video preview per fasi allenamento
  const WARMUP_VIDEO = require('../../assets/video/warmup.mp4');
  const WALKING_VIDEO = require('../../assets/video/walking.mp4');
  const FAST_VIDEO = require('../../assets/video/fast.mp4');
  const COOLDOWN_VIDEO = require('../../assets/video/cooldown.mp4');
  const hasWarmupVideo = true;

  const [phasePreviewVideo, setPhasePreviewVideo] = useState<any>(null);
  const [phasePreviewTitle, setPhasePreviewTitle] = useState('');
  const [phasePreviewSub, setPhasePreviewSub] = useState('');

  const getPhaseVideo = (type: string, speed?: string) => {
    if (type === 'warmup') return { video: WARMUP_VIDEO, title: 'RISCALDAMENTO', sub: 'Guarda il movimento corretto' };
    if (type === 'cooldown') return { video: COOLDOWN_VIDEO, title: 'DEFATICAMENTO', sub: 'Rallenta gradualmente il passo' };
    if (speed === 'fast') return { video: FAST_VIDEO, title: 'CAMMINATA VELOCE', sub: 'Aumenta il ritmo!' };
    return { video: WALKING_VIDEO, title: 'CAMMINATA SOSTENUTA', sub: 'Mantieni un passo costante e deciso' };
  };
  const [graphPeriod, setGraphPeriod] = useState<7 | 30 | 90>(30);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const pedometerSubscription = useRef<any>(null);
  const mapRef = useRef<MapView>(null);
  const initialStepsRef = useRef<number>(0);
  const lastEncouragementRef = useRef<number>(0); // timestamp ultimo incoraggiamento ritmo lento
  const currentIntervalIndexRef = useRef<number>(0); // indice intervallo corrente per evitare stale closure
  // bestItalianVoiceRef rimosso (Step 1+5): non più necessario senza TTS
  const elapsedRef = useRef<number>(0); // tempo trascorso per check fuori da state updater
  const weeklyProgramRef = useRef<WeeklyProgram[]>([]); // ref per evitare stale closure nel timer

  // ===== TRIGGER LOGIC REFS (v5.0) =====
  const lastBodyCoachRef = useRef<number>(0);      // timestamp ultimo body coaching
  const lastSpeedCoachRef = useRef<number>(0);     // timestamp ultimo speed coaching
  // Traccia l'ultima variante riprodotta per categoria: evita ripetizioni immediate
  const lastVariantRef = useRef<{ [category: string]: number }>({});
  // Guard per evitare double-start dal callback video
  const videoAutoStartedRef = useRef<boolean>(false);
  // Guard per bloccare il bottone INIZIA ALLENAMENTO dopo il primo press
  const isWorkoutStartingRef = useRef<boolean>(false);
  // Guard anti-concorrenza per checkIntervalChange (async, chiamata ogni secondo)
  const isCheckingIntervalRef = useRef<boolean>(false);
  // Ref per sessionData accessibile nel timer senza stale closure
  const sessionDataRef = useRef<any>(null);
  // AppState: traccia stato app (active/background) per gestire ritorno da Spotify/Music
  const appStateRef = useRef<string>(AppState.currentState);
  const [returnedFromBackground, setReturnedFromBackground] = useState(false);
  const [showWorkoutSettings, setShowWorkoutSettings] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const { isPremium, refreshStatus } = usePremium();
  const lastSciencePillRef = useRef<number>(0);    // timestamp ultima science pill
  const lastSpeakTimeRef = useRef<number>(0);      // timestamp ultimo speakMessage (anti-overlap)
  const bodyCoachIndexRef = useRef<number>(0);     // cicla tra i 4 tipi body coaching
  const sciencePillIndexRef = useRef<number>(0);   // cicla tra i 6 tipi science pill (0-5)
  const currentSpeedRef = useRef<number>(0);       // velocità GPS corrente (m/s)
  const lastAltitudeRef = useRef<number | null>(null); // ultima altitudine GPS
  const uphillActiveRef = useRef<boolean>(false);  // in fase di salita?
  const streakAnnouncedRef = useRef<number>(0);    // streak già annunciato (evita ripetizioni)
  const weatherCoachDoneRef = useRef<boolean>(false); // weather+time coaching già fatto
  const combackAnnouncedRef = useRef<boolean>(false); // comeback già annunciato
  const userProfileRef = useRef<UserProfile>(null as any); // ref sempre aggiornato al profilo corrente
  const currentPhaseIndexRef = useRef<number>(-1);  // traccia fase corrente per max 1 messaggio/fase
  const phaseMessageSentRef = useRef<boolean>(false); // messaggio coaching già inviato in questa fase
  // Lock: mentre parla il messaggio di cambio fase, blocca TUTTI gli altri messaggi
  const isPlayingPhaseAnnouncementRef = useRef<boolean>(false);
  // Movimento: ultimi passi registrati e timestamp, per rilevare se l'utente è fermo
  const lastStepsForMovingRef = useRef<number>(0);
  const lastStepsTimeRef = useRef<number>(Date.now());
  // Timestamp ultima transizione di fase (per blocco extra di sicurezza 15s post-transizione)
  const lastPhaseTransitionTimeRef = useRef<number>(0);

  // ─── AUDIO NOME (Step 3) ──────────────────────────────────────────────────
  // true mentre ElevenLabs genera i file MP3 del nome utente
  const [isGeneratingNameAudio, setIsGeneratingNameAudio] = useState(false);
  // Cartella locale per i file nome — creata al primo utilizzo
  const NAME_AUDIO_DIR = (FileSystem.documentDirectory ?? '') + 'fitwalk_audio/';
  // Percorso file per voce: male → MATTEO, female → TAMMY
  const getNameAudioPath = (voiceKey: 'male' | 'female'): string =>
    NAME_AUDIO_DIR + `nome_${voiceKey}.mp3`;


  // MET values (ACSM standard)
  const MET_VALUES = {
    slow: 2.9,      // riscaldamento/defaticamento ~4.5 km/h
    moderate: 3.8,   // camminata moderata ~5.0 km/h
    fast: 5.0        // camminata veloce ~6.0 km/h
  };

  // Velocità personalizzate per livello fitness (km/h)
  const SPEED_BY_LEVEL: { [key: string]: { warmup: number; moderate: number; fast: number; cooldown: number } } = {
    beginner:     { warmup: 4.0, moderate: 4.8, fast: 5.5, cooldown: 4.0 },
    intermediate: { warmup: 4.5, moderate: 5.2, fast: 6.0, cooldown: 4.5 },
    advanced:     { warmup: 5.0, moderate: 5.5, fast: 6.5, cooldown: 4.5 },
  };

  // Progressione settimanale adattiva (8 settimane, overload ~10%/settimana)
  // fastMin/modMin = minuti veloce/moderata per ogni intervallo, reps = ripetizioni
  const WEEKLY_PROGRESSION: { [key: number]: { totalActive: number; fastMin: number; modMin: number; reps: number; warmup: number; cooldown: number } } = {
    1:  { totalActive: 25, fastMin: 1, modMin: 4, reps: 5, warmup: 5, cooldown: 5 },   // 35 min tot, 20% veloce
    2:  { totalActive: 28, fastMin: 1, modMin: 3.5, reps: 6, warmup: 5, cooldown: 5 },  // 38 min, 21%
    3:  { totalActive: 30, fastMin: 2, modMin: 3, reps: 6, warmup: 5, cooldown: 5 },    // 40 min, 40%
    4:  { totalActive: 32, fastMin: 2, modMin: 3, reps: 6, warmup: 5, cooldown: 5 },    // 42 min, 37%
    5:  { totalActive: 34, fastMin: 2.5, modMin: 2.5, reps: 7, warmup: 5, cooldown: 5 },// 44 min, 50%
    6:  { totalActive: 36, fastMin: 3, modMin: 2.5, reps: 6, warmup: 5, cooldown: 5 },  // 46 min, 50%
    7:  { totalActive: 38, fastMin: 3, modMin: 2.5, reps: 7, warmup: 5, cooldown: 5 },  // 48 min, 55%
    8:  { totalActive: 40, fastMin: 3.5, modMin: 2.5, reps: 7, warmup: 5, cooldown: 5 },// 50 min, 58%
  };

  // Initialize
  // Mantieni userProfileRef sempre aggiornato — usato da getAudioFolder per evitare stale closure
  useEffect(() => { userProfileRef.current = userProfile; }, [userProfile]);

  useEffect(() => {
    // Audio: mix con musica esterna (Spotify etc.), suona anche in silent mode
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'mixWithOthers',
    });

    // TTS voce italiana rimosso (Step 1+5): non più necessario senza expo-speech

    initializeBadges();
  }, []);

  const initializeBadges = () => {
    const initialBadges: Badge[] = [
      // ===== FITNESS BADGES =====
      { id: 'first_workout', icon: '\u{1F45F}', title: 'First Step',
        tagline: 'Il passo più importante? Il primo.',
        description: 'Completa il tuo primo allenamento',
        category: 'fitness', unlocked: false, progress: 0, target: 1 },
      { id: 'streak_7', icon: '\u{1F525}', title: 'Week on Fire',
        tagline: 'Sette giorni di fila. Sei in fiamme.',
        description: '7 giorni consecutivi di allenamento',
        category: 'fitness', unlocked: false, progress: 0, target: 7 },
      { id: 'steps_10k', icon: '\u{1F463}', title: '10K Steps',
        tagline: 'Diecimila passi. In un solo allenamento.',
        description: '10.000 passi in un singolo workout',
        category: 'fitness', unlocked: false, progress: 0, target: 10000 },
      { id: 'distance_5k', icon: '\u{1F6E4}\uFE0F', title: '5K Total',
        tagline: 'Cinque chilometri accumulati. Si cresce.',
        description: '5 km cumulativi totali',
        category: 'fitness', unlocked: false, progress: 0, target: 5 },
      { id: 'full_week', icon: '\u2705', title: 'Perfect Week',
        tagline: 'Tutti gli allenamenti fatti. Settimana perfetta.',
        description: 'Tutti gli allenamenti della settimana completati',
        category: 'fitness', unlocked: false, progress: 0, target: 1 },
      { id: 'speed_demon', icon: '\u26A1', title: 'Speed Demon',
        tagline: 'Media sopra i 6 km/h. Che velocità!',
        description: 'Media > 6 km/h in un workout',
        category: 'fitness', unlocked: false, progress: 0, target: 1 },
      { id: 'goal_reached', icon: '\u{1F3C6}', title: 'Goal Reached',
        tagline: 'Obiettivo raggiunto. Ce l\'hai fatta.',
        description: 'Peso obiettivo raggiunto',
        category: 'fitness', unlocked: false, progress: 0, target: 1 },
      // ===== WEATHER BADGES =====
      { id: 'rain_walker', icon: '\u{1F327}\uFE0F', title: 'Rain Walker',
        tagline: 'Neanche la pioggia ti ferma!',
        description: 'Allenamento completato sotto la pioggia',
        category: 'weather', unlocked: false, progress: 0, target: 1 },
      { id: 'ice_walker', icon: '\u2744\uFE0F', title: 'Ice Walker',
        tagline: 'Col freddo sei ancora più forte!',
        description: 'Allenamento con temperatura sotto i 5\u00B0C',
        category: 'weather', unlocked: false, progress: 0, target: 1 },
      { id: 'heat_warrior', icon: '\u{1F525}', title: 'Heat Warrior',
        tagline: 'Uao! Neanche il caldo ti ha fermato!',
        description: 'Allenamento con temperatura sopra i 30\u00B0C',
        category: 'weather', unlocked: false, progress: 0, target: 1 },
      { id: 'wind_rider', icon: '\u{1F32C}\uFE0F', title: 'Wind Rider',
        tagline: 'Il vento oggi soffiava forte. Tu di più.',
        description: 'Allenamento con vento sopra i 20 km/h',
        category: 'weather', unlocked: false, progress: 0, target: 1 },
      { id: 'all_weather', icon: '\u{1F308}', title: 'All Weather',
        tagline: 'Sole, pioggia, freddo, caldo. Tu sempre.',
        description: 'Almeno 1 allenamento con sole, pioggia, freddo e caldo',
        category: 'weather', unlocked: false, progress: 0, target: 4 },
      { id: 'unstoppable', icon: '\u26A1', title: 'Unstoppable',
        tagline: '10 volte col maltempo. Sei una leggenda.',
        description: '10 allenamenti con condizioni avverse',
        category: 'weather', unlocked: false, progress: 0, target: 10 },
      // ===== TIME BADGES =====
      { id: 'early_bird', icon: '\u{1F305}', title: 'Early Bird',
        tagline: 'Il mondo dormiva. Tu no.',
        description: 'Allenamento iniziato prima delle 7:00',
        category: 'time', unlocked: false, progress: 0, target: 1 },
      { id: 'night_owl', icon: '\u{1F319}', title: 'Night Owl',
        tagline: 'Anche di notte, un passo alla volta.',
        description: 'Allenamento iniziato dopo le 21:00',
        category: 'time', unlocked: false, progress: 0, target: 1 },
      { id: 'dawn_patrol', icon: '\u{1F304}', title: 'Dawn Patrol',
        tagline: "L'alba è il tuo momento. Tre volte.",
        description: '3 allenamenti iniziati prima dell\'alba',
        category: 'time', unlocked: false, progress: 0, target: 3 },
      { id: 'sunset_lover', icon: '\u{1F307}', title: 'Sunset Lover',
        tagline: 'Tre tramonti, tre allenamenti. Poesia.',
        description: '3 allenamenti durante il tramonto',
        category: 'time', unlocked: false, progress: 0, target: 3 },
      { id: 'lunch_hero', icon: '\u{1F957}', title: 'Lunch Break Hero',
        tagline: 'La pausa pranzo più utile che ci sia.',
        description: '5 allenamenti tra le 12:00 e le 14:00',
        category: 'time', unlocked: false, progress: 0, target: 5 },
      { id: 'four_seasons', icon: '\u{1F342}', title: 'Four Seasons',
        tagline: 'Un anno di camminate. Tutte le stagioni.',
        description: 'Almeno 1 allenamento per ogni stagione',
        category: 'time', unlocked: false, progress: 0, target: 4 },
    ];
    setBadges(initialBadges);
  };

  // Load saved data
  useEffect(() => {
    loadAllData();
    checkGPSPermission();
    checkPedometerAvailability();

    // AppState listener: auto-pausa quando l'app va in background (es. utente apre Spotify)
    // iOS: active → inactive → background (non active → background direttamente)
    // Usiamo un ref per tracciare se il workout era attivo quando si è usciti
    const workoutWasActiveRef = { current: false };

    const subscription = AppState.addEventListener('change', (nextState: string) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      // App va in background o inattiva: salva stato e auto-pausa
      if (nextState === 'background' || nextState === 'inactive') {
        if (prev === 'active') {
          setIsWorkoutActive(current => {
            workoutWasActiveRef.current = current;
            if (current) {
              setSessionData(p => ({ ...p, isActive: false }));
              isWorkoutStartingRef.current = false; // sblocca il bottone INIZIA al ritorno
              return false;
            }
            return current;
          });
          // Notifica il Watch che l'app è andata in background
          WatchModule?.updateApplicationContext({ isActive: false });
        }
      }

      // App torna in foreground
      if (nextState === 'active' && (prev === 'background' || prev === 'inactive')) {
        if (workoutWasActiveRef.current) {
          setReturnedFromBackground(true);
          workoutWasActiveRef.current = false;
        }
      }
    });

    // Listener comandi dal Watch (pausa, riprendi, skip)
    const unsubWatch = WatchModule?.watchEvents?.on('message', (message: any) => {
      const cmd = message?.command;
      if (cmd === 'pause') {
        setIsWorkoutActive(false);
        setSessionData(prev => ({ ...prev, isActive: false }));
        speakMessage('pause', { name: userProfileRef.current?.name || '' });
      } else if (cmd === 'resume') {
        setIsWorkoutActive(true);
        setSessionData(prev => ({ ...prev, isActive: true }));
        speakMessage('resume', { name: userProfileRef.current?.name || '' });
      } else if (cmd === 'next') {
        skipToNextInterval();
      } else if (cmd === 'previous') {
        skipToPreviousInterval();
      }
    });

    return () => {
      subscription.remove();
      unsubWatch();
    };
  }, []);

  const loadAllData = async () => {
    try {
      const [profileData, historyData, weightData, badgeData, waterData, notifData, nutritionData, healthData, indoorData, routesData, levelData, planData, milestoneWeightData] = await Promise.all([
        AsyncStorage.getItem('fitWalkProfile'),
        AsyncStorage.getItem('fitWalkHistory'),
        AsyncStorage.getItem('fitWalkWeightHistory'),
        AsyncStorage.getItem('fitWalkBadges'),
        AsyncStorage.getItem('fitWalkWaterHistory'),
        AsyncStorage.getItem('fitWalkNotifPrefs'),
        AsyncStorage.getItem('fitWalkShowNutrition'),
        AsyncStorage.getItem('fitWalkHealthSync'),
        AsyncStorage.getItem('fitWalkIndoorMode'),
        AsyncStorage.getItem('fitWalkSavedRoutes'),
        AsyncStorage.getItem('fitWalkUserLevel'),
        AsyncStorage.getItem('fitWalkActivePlan'),
        AsyncStorage.getItem('fitWalkLastMilestoneWeight'),
      ]);

      if (profileData) {
        const profile = JSON.parse(profileData);
        setUserProfile(profile);
        generateProgram(profile);
        setCurrentScreen('dashboard');
        // Controlla silenziosamente se i file MP3 del nome esistono.
        // Se mancano (reinstallazione, primo aggiornamento con Step 3), li rigenera in background.
        if (profile.name?.trim()) {
          checkAndRegenerateNameAudio(profile.name);
        }
      }

      if (historyData) setWorkoutHistory(JSON.parse(historyData));
      if (weightData) setWeightHistory(JSON.parse(weightData));
      if (badgeData) {
        const savedBadges = JSON.parse(badgeData);
        // Migration: if saved badges lack 'category' field, reinitialize with new format
        if (savedBadges.length > 0 && !savedBadges[0].category) {
          console.log('Badge migration: old format detected, reinitializing 19 badges');
          initializeBadges();
          // Preserve unlock status from old badges
          setTimeout(() => {
            setBadges(prev => prev.map(newBadge => {
              const oldBadge = savedBadges.find((ob: any) => ob.id === newBadge.id);
              if (oldBadge && oldBadge.unlocked) {
                return { ...newBadge, unlocked: true, unlockedDate: oldBadge.unlockedDate, progress: oldBadge.progress };
              }
              return newBadge;
            }));
          }, 100);
        } else if (savedBadges.length < 19) {
          // Saved badges are new format but incomplete (e.g. added new badges)
          initializeBadges();
          setTimeout(() => {
            setBadges(prev => prev.map(newBadge => {
              const saved = savedBadges.find((sb: any) => sb.id === newBadge.id);
              return saved || newBadge;
            }));
          }, 100);
        } else {
          setBadges(savedBadges);
        }
      }
      if (waterData) setWaterHistory(JSON.parse(waterData));
      if (notifData) setNotificationPrefs(JSON.parse(notifData));
      if (nutritionData) setShowNutritionTips(JSON.parse(nutritionData));
      if (healthData) setHealthSyncEnabled(JSON.parse(healthData));
      if (indoorData) setIndoorMode(JSON.parse(indoorData));
      if (routesData) setSavedRoutes(JSON.parse(routesData));
      if (levelData) setUserLevel(JSON.parse(levelData));
      if (planData) setActivePlan(JSON.parse(planData));

      // Inizializza lastMilestoneWeight se non esiste ancora
      if (!milestoneWeightData && profileData) {
        const profile = JSON.parse(profileData);
        await AsyncStorage.setItem('fitWalkLastMilestoneWeight', JSON.stringify(profile.weight));
      }

      // Leggi peso aggiornato da HealthKit se la sync è attiva
      // (eseguito dopo aver caricato healthData, in background)
      if (healthData && JSON.parse(healthData) === true && AppleHealthKit) {
        setTimeout(async () => {
          const hkWeight = await readWeightFromHealth();
          if (hkWeight !== null) {
            setWeightHistory(prev => {
              if (prev.length === 0) return prev;
              const last = prev[prev.length - 1];
              // Aggiorna solo se il peso HealthKit è diverso dall'ultimo registrato
              if (Math.abs(last.weight - hkWeight) >= 0.1) {
                const updated = [...prev, { date: new Date().toISOString(), weight: hkWeight }];
                AsyncStorage.setItem('fitWalkWeightHistory', JSON.stringify(updated));
                setUserProfile(p => ({ ...p, weight: hkWeight }));
                return updated;
              }
              return prev;
            });
          }
        }, 2000); // piccolo delay per lasciar terminare il render iniziale
      }
    } catch (error) {
      console.log('Error loading data:', error);
    }
  };

  const saveAllData = async (overrides: { profile?: any } = {}) => {
    try {
      await Promise.all([
        AsyncStorage.setItem('fitWalkProfile', JSON.stringify(overrides.profile ?? userProfile)),
        AsyncStorage.setItem('fitWalkHistory', JSON.stringify(workoutHistory)),
        AsyncStorage.setItem('fitWalkWeightHistory', JSON.stringify(weightHistory)),
        AsyncStorage.setItem('fitWalkBadges', JSON.stringify(badges)),
        AsyncStorage.setItem('fitWalkWaterHistory', JSON.stringify(waterHistory)),
        AsyncStorage.setItem('fitWalkWaterToday', JSON.stringify(waterToday)),
        AsyncStorage.setItem('fitWalkNotifPrefs', JSON.stringify(notificationPrefs)),
        AsyncStorage.setItem('fitWalkShowNutrition', JSON.stringify(showNutritionTips)),
        AsyncStorage.setItem('fitWalkHealthSync', JSON.stringify(healthSyncEnabled)),
        AsyncStorage.setItem('fitWalkIndoorMode', JSON.stringify(indoorMode)),
        AsyncStorage.setItem('fitWalkSavedRoutes', JSON.stringify(savedRoutes)),
        AsyncStorage.setItem('fitWalkUserLevel', JSON.stringify(userLevel)),
        AsyncStorage.setItem('fitWalkActivePlan', JSON.stringify(activePlan)),
      ]);
    } catch (error) {
      console.error('Error saving data:', error);
    }
  };

  // ============= v5.0 FEATURES =============

  // --- NOTIFICHE PROMEMORIA ---
  const setupNotifications = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permesso negato', 'Abilita le notifiche nelle Impostazioni del telefono per ricevere i promemoria.');
      return false;
    }
    return true;
  };

  const scheduleWeeklyNotifications = async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!notificationPrefs.enabled || userProfile.trainingDays.length === 0) return;

    const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    const todayProgram = weeklyProgram[currentWeek - 1];
    const duration = todayProgram ? todayProgram.totalDuration : 35;

    for (const day of userProfile.trainingDays) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${userProfile.name}, oggi è giorno di camminata!`,
          body: `${duration} minuti ti aspettano. Settimana ${currentWeek} del tuo programma.`,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: day + 1, // Notifications usa 1=domenica, noi 0=domenica
          hour: notificationPrefs.hour,
          minute: notificationPrefs.minute,
        },
      });
    }
  };

  // Aggiorna notifiche quando cambiano le preferenze
  useEffect(() => {
    if (notificationPrefs.enabled && userProfile.trainingDays.length > 0) {
      scheduleWeeklyNotifications();
    }
  }, [notificationPrefs, userProfile.trainingDays, currentWeek]);

  // Rigenera programma quando cambia piano attivo
  useEffect(() => {
    if (userProfile.weight > 0 && weeklyProgram.length > 0) {
      generateProgram(userProfile);
    }
  }, [activePlan]);

  // --- WATER TRACKER ---
  const waterGoal = Math.round((userProfile.weight || 70) * 0.033 * 4); // bicchieri da 250ml

  const addWaterGlass = () => {
    const newCount = waterToday + 1;
    setWaterToday(newCount);
    // Salva in storico
    const today = new Date().toISOString().split('T')[0];
    setWaterHistory(prev => {
      const existing = prev.findIndex(r => r.date === today);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { date: today, glasses: newCount };
        return updated;
      }
      return [...prev, { date: today, glasses: newCount }];
    });
  };

  const removeWaterGlass = () => {
    if (waterToday > 0) {
      const newCount = waterToday - 1;
      setWaterToday(newCount);
      const today = new Date().toISOString().split('T')[0];
      setWaterHistory(prev => {
        const existing = prev.findIndex(r => r.date === today);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = { date: today, glasses: newCount };
          return updated;
        }
        return prev;
      });
    }
  };

  // Reset water counter a mezzanotte
  useEffect(() => {
    const checkDate = async () => {
      const lastDate = await AsyncStorage.getItem('fitWalkWaterDate');
      const today = new Date().toISOString().split('T')[0];
      if (lastDate !== today) {
        setWaterToday(0);
        await AsyncStorage.setItem('fitWalkWaterDate', today);
      } else {
        const saved = await AsyncStorage.getItem('fitWalkWaterToday');
        if (saved) setWaterToday(JSON.parse(saved));
      }
    };
    checkDate();
  }, []);

  // --- PESO POPUP SETTIMANALE ---
  useEffect(() => {
    const checkWeightPopup = async () => {
      const lastWeightDate = await AsyncStorage.getItem('fitWalkLastWeightDate');
      if (!lastWeightDate) return;
      const daysSince = Math.floor((Date.now() - new Date(lastWeightDate).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince >= 7 && currentScreen === 'dashboard') {
        setShowWeightPopup(true);
      }
    };
    if (currentScreen === 'dashboard' && weightHistory.length > 0) {
      checkWeightPopup();
    }
  }, [currentScreen]);

  const submitWeightUpdate = () => {
    const weight = parseFloat(weightInputValue);
    if (weight && weight > 0) {
      const newRecord: WeightRecord = { date: new Date().toISOString(), weight };
      setWeightHistory(prev => [...prev, newRecord]);
      setUserProfile(prev => ({ ...prev, weight }));
      AsyncStorage.setItem('fitWalkLastWeightDate', new Date().toISOString());
      setShowWeightPopup(false);
      setWeightInputValue('');
      syncWeightToHealth(weight);
      checkWeightMilestone(weight);
      saveAllData();
    }
  };

  // --- TIP GIORNALIERO ---
  const getDailyTip = () => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    return DAILY_TIPS[dayOfYear % DAILY_TIPS.length];
  };

  // ============= FEATURE 1: OBIETTIVI MENSILI DINAMICI =============
  const generateMonthlyGoals = () => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // Calcola medie dallo storico
    const last30 = workoutHistory.filter(w => {
      const d = new Date(w.date);
      return (now.getTime() - d.getTime()) < 30 * 24 * 60 * 60 * 1000;
    });
    const avgKmPerWorkout = last30.length > 0 ? last30.reduce((s, w) => s + parseFloat(w.distance), 0) / last30.length : 2;
    const workoutsPerMonth = userProfile.trainingDays.length * 4;
    
    // Obiettivi: +15% rispetto alla media (sfidanti ma raggiungibili)
    const kmGoal = Math.round(avgKmPerWorkout * workoutsPerMonth * 1.15);
    const workoutGoal = Math.min(workoutsPerMonth + 2, 28);
    const stepsGoal = Math.round((last30.length > 0 ? last30.reduce((s, w) => s + w.steps, 0) / last30.length : 5000) * workoutsPerMonth * 1.1);

    // Calcola progresso attuale del mese
    const thisMonth = workoutHistory.filter(w => w.date.startsWith(monthKey));
    const currentKm = thisMonth.reduce((s, w) => s + parseFloat(w.distance), 0);
    const currentSteps = thisMonth.reduce((s, w) => s + w.steps, 0);

    const goals: MonthlyGoal[] = [
      { id: 'km', title: `Cammina ${kmGoal} km`, icon: 'straighten', target: kmGoal, current: Math.round(currentKm * 10) / 10, unit: 'km', month: monthKey },
      { id: 'workouts', title: `${workoutGoal} allenamenti`, icon: 'directions-walk', target: workoutGoal, current: thisMonth.length, unit: 'sessioni', month: monthKey },
      { id: 'steps', title: `${Math.round(stepsGoal / 1000)}k passi totali`, icon: 'footprint', target: stepsGoal, current: currentSteps, unit: 'passi', month: monthKey },
    ];
    setMonthlyGoals(goals);
  };

  useEffect(() => {
    if (workoutHistory.length >= 0 && userProfile.trainingDays.length > 0) {
      generateMonthlyGoals();
    }
  }, [workoutHistory, currentScreen]);

  // ============= FEATURE 2: PERCORSI SALVATI =============
  const saveRoute = (name: string, route: RouteCoordinate[], distance: number) => {
    const newRoute: SavedRoute = {
      id: Date.now().toString(),
      name,
      date: new Date().toISOString(),
      route,
      distance: Math.round(distance * 100) / 100,
    };
    setSavedRoutes(prev => [newRoute, ...prev].slice(0, 20)); // max 20 percorsi
    addXP('monthly_goal'); // bonus XP per salvare un percorso
    saveAllData();
  };

  const deleteRoute = (id: string) => {
    setSavedRoutes(prev => prev.filter(r => r.id !== id));
    saveAllData();
  };

  // ============= FEATURE 3: LIVELLI / XP =============
  const addXP = (action: keyof typeof XP_PER_ACTION, multiplier: number = 1) => {
    const xpGained = Math.round(XP_PER_ACTION[action] * multiplier);
    setUserLevel(prev => {
      const newXP = prev.xp + xpGained;
      // Trova il livello corretto
      let newLevel = LEVEL_THRESHOLDS[0];
      for (const threshold of LEVEL_THRESHOLDS) {
        if (newXP >= threshold.xp) newLevel = threshold;
      }
      const leveledUp = newLevel.level > prev.level;
      if (leveledUp) {
        Alert.alert(
          '🎉 Livello UP!',
          `Sei salito al livello ${newLevel.level}: ${newLevel.title}!\n+${xpGained} XP`,
        );
      }
      return { xp: newXP, level: newLevel.level, title: newLevel.title };
    });
  };

  const getXPForNextLevel = () => {
    const nextLevel = LEVEL_THRESHOLDS.find(l => l.xp > userLevel.xp);
    return nextLevel ? nextLevel.xp - userLevel.xp : 0;
  };

  const getXPProgress = () => {
    const currentThreshold = LEVEL_THRESHOLDS.filter(l => l.xp <= userLevel.xp).pop();
    const nextThreshold = LEVEL_THRESHOLDS.find(l => l.xp > userLevel.xp);
    if (!currentThreshold || !nextThreshold) return 100;
    const range = nextThreshold.xp - currentThreshold.xp;
    const progress = userLevel.xp - currentThreshold.xp;
    return Math.round((progress / range) * 100);
  };

  // ============= FEATURE 4: CAMMINATE GUIDATE =============
  const GUIDED_WALKS: GuidedWalkSession[] = [
    {
      id: 'motivational',
      title: 'Motivazionale',
      subtitle: '30 min — Energia e determinazione',
      duration: 30,
      icon: 'flash-on',
      color: '#F59E0B',
      cues: [
        { minuteMark: 0, messageId: 'guided_motiv_start', text: '{name}, oggi è il tuo momento. Trenta minuti per te, per il tuo corpo, per la tua energia. Partiamo con un riscaldamento leggero, cammina e respira.' },
        { minuteMark: 2, messageId: 'guided_motiv_02', text: 'Ogni passo che fai è una scelta. Hai scelto di essere qui, e questo già ti rende speciale.' },
        { minuteMark: 5, messageId: 'guided_motiv_05', text: 'Riscaldamento completato. Ora alza il ritmo, cammina con decisione. Schiena dritta, sguardo avanti, braccia in movimento.' },
        { minuteMark: 8, messageId: 'guided_motiv_08', text: 'Stai andando alla grande {name}. Senti il ritmo del tuo corpo. Tu puoi.' },
        { minuteMark: 11, messageId: 'guided_motiv_11', text: 'A volte la parte più difficile è iniziare. E tu l\'hai già fatto. Ora goditi questa camminata.' },
        { minuteMark: 14, messageId: 'guided_motiv_14', text: 'Siamo a metà {name}! Quindici minuti fatti. Il tuo corpo ti sta ringraziando.' },
        { minuteMark: 17, messageId: 'guided_motiv_17', text: 'Non contano i chilometri, conta la costanza. Ogni giorno che esci a camminare è un giorno vinto.' },
        { minuteMark: 20, messageId: 'guided_motiv_20', text: 'Venti minuti {name}! Ancora dieci e hai conquistato la tua giornata.' },
        { minuteMark: 23, messageId: 'guided_motiv_23', text: 'Gli ultimi minuti sono quelli che contano di più. Quando il corpo dice basta, la mente dice ancora.' },
        { minuteMark: 25, messageId: 'guided_motiv_25', text: 'Inizia a rallentare dolcemente. Cinque minuti di defaticamento.' },
        { minuteMark: 27, messageId: 'guided_motiv_27', text: 'Rallenta ancora, respira profondamente. Inspira dal naso, espira dalla bocca.' },
        { minuteMark: 29.5, messageId: 'guided_motiv_end', text: 'Complimenti {name}! Trenta minuti di pura energia. Sei più forte. A domani!' },
      ],
    },
    {
      id: 'relax',
      title: 'Anti-Stress',
      subtitle: '25 min — Respirazione e relax',
      duration: 25,
      icon: 'spa',
      color: '#8B5CF6',
      cues: [
        { minuteMark: 0, messageId: 'guided_relax_start', text: '{name}, questa camminata è un regalo che ti fai. Non c\'è fretta, non c\'è ritmo. Solo tu e i tuoi passi.' },
        { minuteMark: 2, messageId: 'guided_relax_02', text: 'Porta l\'attenzione ai tuoi piedi. Senti il contatto con il suolo. Tallone, pianta, punta.' },
        { minuteMark: 5, messageId: 'guided_relax_05', text: 'Concentrati sul respiro. Inspira contando fino a quattro. Trattieni per due. Espira contando fino a sei.' },
        { minuteMark: 8, messageId: 'guided_relax_08', text: 'Se la mente vaga, va bene. Riporta gentilmente l\'attenzione al respiro e ai tuoi passi.' },
        { minuteMark: 10, messageId: 'guided_relax_10', text: 'Ascolta i suoni intorno a te. Sei parte di tutto questo. Sei esattamente dove devi essere.' },
        { minuteMark: 13, messageId: 'guided_relax_13', text: 'Oltre la metà {name}. Nota le spalle: se sono tese, lasciale cadere. Rilassa la mascella.' },
        { minuteMark: 16, messageId: 'guided_relax_16', text: 'Ogni passo lascia andare qualcosa. Lo stress, le preoccupazioni. Qui non servono.' },
        { minuteMark: 19, messageId: 'guided_relax_19', text: 'Cammina ancora con questa leggerezza. Non devi andare da nessuna parte. Sei già arrivato.' },
        { minuteMark: 22, messageId: 'guided_relax_22', text: 'Inizia a rallentare. Tre respiri profondi: inspira tutta la calma, espira tutta la tensione.' },
        { minuteMark: 24.5, messageId: 'guided_relax_end', text: '{name}, venticinque minuti di pace. Porta questa calma con te nel resto della giornata.' },
      ],
    },
    {
      id: 'coaching',
      title: 'Walk & Talk',
      subtitle: '35 min — Consigli tecnici',
      duration: 35,
      icon: 'school',
      color: '#3B82F6',
      cues: [
        { minuteMark: 0, messageId: 'guided_coach_start', text: 'Ciao {name}! Oggi camminiamo insieme e ti do qualche consiglio tecnico. Partiamo con il riscaldamento.' },
        { minuteMark: 3, messageId: 'guided_coach_03', text: 'Prima regola: la postura. Immagina un filo che ti tira dalla sommità della testa. Schiena dritta, mento parallelo al suolo.' },
        { minuteMark: 5, messageId: 'guided_coach_05', text: 'Riscaldamento fatto. Le braccia: piegale a 90 gradi, muovile in modo opposto alle gambe.' },
        { minuteMark: 8, messageId: 'guided_coach_08', text: 'Le braccia non sono decorative {name}. Un buon movimento delle braccia aumenta la velocità del 10 percento.' },
        { minuteMark: 11, messageId: 'guided_coach_11', text: 'Parliamo di piedi. L\'appoggio corretto: tallone, rotola verso l\'avampiede, spingi con le dita.' },
        { minuteMark: 14, messageId: 'guided_coach_14', text: 'Il passo. Passi corti e veloci sono meglio di passi lunghi e lenti. Più cadenza, meno ampiezza.' },
        { minuteMark: 17, messageId: 'guided_coach_17', text: 'Siamo a metà. Controlla: spalle rilassate? Braccia a 90 gradi? Pancia leggermente contratta?' },
        { minuteMark: 20, messageId: 'guided_coach_20', text: 'Il respiro: inspira dal naso per 3 passi, espira dalla bocca per 3 passi.' },
        { minuteMark: 23, messageId: 'guided_coach_23', text: 'In salita: accorcia il passo, inclina leggermente il busto. In discesa: passi piccoli, ginocchia piegate.' },
        { minuteMark: 26, messageId: 'guided_coach_26', text: 'Tre camminate moderate a settimana fanno più di una sola camminata estrema. La costanza batte l\'intensità.' },
        { minuteMark: 28, messageId: 'guided_coach_28', text: 'Idratazione: bevi prima, durante e dopo. Non aspettare la sete.' },
        { minuteMark: 30, messageId: 'guided_coach_30', text: 'Defaticamento. Rallenta gradualmente, non fermarti di colpo.' },
        { minuteMark: 33, messageId: 'guided_coach_33', text: 'Se puoi, fai 3 minuti di stretching: polpacci, quadricipiti, anche.' },
        { minuteMark: 34.5, messageId: 'guided_coach_end', text: 'Ottima sessione {name}! Ricorda: postura dritta, braccia a 90, passi corti e veloci, respiro ritmato. Alla prossima!' },
      ],
    },
  ];

  // ============= FEATURE 5: PIANI MULTIPLI =============
  const TRAINING_PLANS: TrainingPlan[] = [
    { id: 'weightloss', title: 'Dimagrimento', subtitle: 'Interval training per perdere peso', icon: 'monitor-weight', color: Colors.healthGreen, weeks: 8, description: 'Il piano classico FitWalk: interval training progressivo per bruciare calorie e raggiungere il tuo peso ideale.' },
    { id: 'cardio', title: 'Salute Cardiovascolare', subtitle: 'Camminata costante per il cuore', icon: 'favorite', color: '#EF4444', weeks: 8, description: 'Camminata sostenuta e costante per rafforzare il sistema cardiovascolare. Meno intervalli, più resistenza.' },
    { id: 'stress', title: 'Gestione Stress', subtitle: 'Ritmo moderato e respirazione', icon: 'spa', color: '#8B5CF6', weeks: 6, description: 'Camminata a ritmo moderato con pause di respirazione consapevole. Per ritrovare calma e equilibrio.' },
    { id: 'tonic', title: 'Tonificazione', subtitle: 'Camminata + esercizi corpo libero', icon: 'fitness-center', color: '#F59E0B', weeks: 8, description: 'Camminata intervallata da esercizi a corpo libero: squat, affondi, sollevamenti. Per gambe, glutei e core.' },
    { id: 'energy', title: 'Energia e Vitalità', subtitle: 'Per chi vuole sentirsi meglio', icon: 'bolt', color: '#10B981', weeks: 6, description: 'Non devi dimagrire? Questo piano è per te: ritmo vario, niente bilancia, solo energia e buonumore.' },
  ];

  // Progressioni per i nuovi piani
  const PLAN_PROGRESSIONS: { [key in PlanType]?: { [week: number]: { totalActive: number; fastMin: number; modMin: number; reps: number; warmup: number; cooldown: number } } } = {
    cardio: {
      // Intervalli lunghi e uniformi, stile giapponese 3x3 progressivo
      // totalActive = modMin*(reps+1) + fastMin*reps
      1: { totalActive: 28, fastMin: 2, modMin: 4, reps: 4, warmup: 5, cooldown: 5 },
      2: { totalActive: 30, fastMin: 2, modMin: 4, reps: 5, warmup: 5, cooldown: 5 },
      3: { totalActive: 33, fastMin: 3, modMin: 3, reps: 5, warmup: 5, cooldown: 5 },
      4: { totalActive: 35, fastMin: 3, modMin: 3.5, reps: 5, warmup: 5, cooldown: 5 },
      5: { totalActive: 36, fastMin: 3, modMin: 3, reps: 6, warmup: 5, cooldown: 5 },
      6: { totalActive: 39, fastMin: 3, modMin: 3, reps: 6, warmup: 5, cooldown: 5 },
      7: { totalActive: 42, fastMin: 3, modMin: 3, reps: 7, warmup: 5, cooldown: 5 },
      8: { totalActive: 45, fastMin: 3, modMin: 3, reps: 7, warmup: 5, cooldown: 5 },
    },
    stress: {
      // Camminata continua rilassante — un unico blocco, no intervalli
      1: { totalActive: 15, fastMin: 0, modMin: 15, reps: 1, warmup: 5, cooldown: 5 },
      2: { totalActive: 18, fastMin: 0, modMin: 18, reps: 1, warmup: 5, cooldown: 5 },
      3: { totalActive: 20, fastMin: 0, modMin: 20, reps: 1, warmup: 5, cooldown: 5 },
      4: { totalActive: 22, fastMin: 0, modMin: 22, reps: 1, warmup: 5, cooldown: 5 },
      5: { totalActive: 25, fastMin: 0, modMin: 25, reps: 1, warmup: 5, cooldown: 5 },
      6: { totalActive: 28, fastMin: 0, modMin: 28, reps: 1, warmup: 5, cooldown: 5 },
    },
    tonic: {
      1: { totalActive: 22, fastMin: 1.5, modMin: 3, reps: 5, warmup: 5, cooldown: 5 },
      2: { totalActive: 24, fastMin: 1.5, modMin: 2.5, reps: 6, warmup: 5, cooldown: 5 },
      3: { totalActive: 26, fastMin: 2, modMin: 2.5, reps: 6, warmup: 5, cooldown: 5 },
      4: { totalActive: 28, fastMin: 2, modMin: 2.5, reps: 6, warmup: 5, cooldown: 5 },
      5: { totalActive: 30, fastMin: 2, modMin: 2.5, reps: 6, warmup: 5, cooldown: 5 },
      6: { totalActive: 32, fastMin: 2.5, modMin: 2.5, reps: 6, warmup: 5, cooldown: 5 },
      7: { totalActive: 34, fastMin: 2.5, modMin: 2.5, reps: 7, warmup: 5, cooldown: 5 },
      8: { totalActive: 36, fastMin: 3, modMin: 2, reps: 7, warmup: 5, cooldown: 5 },
    },
    energy: {
      1: { totalActive: 22, fastMin: 1, modMin: 3.4, reps: 5, warmup: 5, cooldown: 5 },
      2: { totalActive: 25, fastMin: 1.5, modMin: 3.5, reps: 5, warmup: 5, cooldown: 5 },
      3: { totalActive: 28, fastMin: 1.5, modMin: 3.2, reps: 6, warmup: 5, cooldown: 5 },
      4: { totalActive: 30, fastMin: 2, modMin: 3, reps: 6, warmup: 5, cooldown: 5 },
      5: { totalActive: 32, fastMin: 2, modMin: 3, reps: 6, warmup: 5, cooldown: 5 },
      6: { totalActive: 35, fastMin: 2.5, modMin: 2.5, reps: 7, warmup: 5, cooldown: 5 },
    },
  };

  const getActiveProgression = () => {
    if (activePlan === 'weightloss') return WEEKLY_PROGRESSION;
    return PLAN_PROGRESSIONS[activePlan] || WEEKLY_PROGRESSION;
  };

  // --- APPLE HEALTH SYNC (dormiente in Expo Go, attiva con build nativo) ---
  const initHealthSync = async () => {
    if (!AppleHealthKit) {
      Alert.alert(
        'Apple Salute non disponibile',
        'Questa funzione sarà disponibile nella versione finale dell\'app. Richiede un build nativo per iOS.',
        [{ text: 'OK' }]
      );
      return false;
    }

    const permissions = {
      permissions: {
        read: [
          AppleHealthKit.Constants.Permissions.Steps,
          AppleHealthKit.Constants.Permissions.DistanceWalkingRunning,
          AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
          AppleHealthKit.Constants.Permissions.Weight,
          AppleHealthKit.Constants.Permissions.Height,
        ],
        write: [
          AppleHealthKit.Constants.Permissions.Steps,
          AppleHealthKit.Constants.Permissions.DistanceWalkingRunning,
          AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
          AppleHealthKit.Constants.Permissions.Weight,
          AppleHealthKit.Constants.Permissions.Workout,
        ],
      },
    };

    return new Promise<boolean>((resolve) => {
      AppleHealthKit.initHealthKit(permissions, (error: string) => {
        if (error) {
          Alert.alert('Errore', 'Impossibile connettersi ad Apple Salute. Verifica i permessi nelle Impostazioni.');
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  };

  const syncWorkoutToHealth = async (workout: WorkoutRecord) => {
    if (!AppleHealthKit || !healthSyncEnabled) return;

    try {
      // Salva allenamento
      const startDate = new Date(workout.date);
      const endDate = new Date(startDate.getTime() + workout.duration * 1000);

      AppleHealthKit.saveWorkout(
        {
          type: 'Walking',
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          energyBurned: workout.calories,
          distance: parseFloat(workout.distance) * 1000, // km -> meters
        },
        (err: any) => { if (err) console.log('Health workout save error:', err); }
      );

      // Salva calorie
      AppleHealthKit.saveActiveEnergyBurned(
        { value: workout.calories, startDate: startDate.toISOString(), endDate: endDate.toISOString() },
        (err: any) => { if (err) console.log('Health calories save error:', err); }
      );
    } catch (error) {
      console.log('Health sync error:', error);
    }
  };

  const syncWeightToHealth = async (weight: number) => {
    if (!AppleHealthKit || !healthSyncEnabled) return;

    try {
      AppleHealthKit.saveWeight(
        { value: weight * 2.20462, unit: 'pound' }, // Health usa pounds
        (err: any) => { if (err) console.log('Health weight save error:', err); }
      );
    } catch (error) {
      console.log('Health weight sync error:', error);
    }
  };

  // Legge il peso più recente da Apple Salute e lo restituisce in kg.
  // Ritorna null se HealthKit non è disponibile, non autorizzato, o senza dati.
  const readWeightFromHealth = async (): Promise<number | null> => {
    if (!AppleHealthKit || !healthSyncEnabled) return null;

    return new Promise((resolve) => {
      try {
        AppleHealthKit.getLatestWeight(
          { unit: 'gram' },
          (err: any, result: any) => {
            if (err || !result?.value) {
              console.log('[HK] getLatestWeight error o nessun dato:', err);
              resolve(null);
              return;
            }
            const kg = parseFloat((result.value / 1000).toFixed(1));
            console.log(`[HK] Peso letto da Apple Salute: ${kg} kg`);
            resolve(kg);
          }
        );
      } catch (e) {
        console.log('[HK] readWeightFromHealth exception:', e);
        resolve(null);
      }
    });
  };

  // Controlla se il peso è sceso di ≥1kg rispetto all'ultimo milestone registrato.
  // Se sì: aggiorna il baseline, mostra notifica visiva, riproduce audio (quando disponibile).
  const checkWeightMilestone = async (newWeight: number) => {
    try {
      const stored = await AsyncStorage.getItem('fitWalkLastMilestoneWeight');
      const lastMilestone = stored ? parseFloat(JSON.parse(stored)) : newWeight;

      const dropped = lastMilestone - newWeight;

      if (dropped >= 1.0) {
        // Calcola quanti kg persi in totale dall'inizio
        const startWeight = userProfile.weight; // peso iniziale del profilo
        const totalLost = parseFloat((startWeight - newWeight).toFixed(1));

        // Aggiorna il baseline al nuovo peso
        await AsyncStorage.setItem('fitWalkLastMilestoneWeight', JSON.stringify(newWeight));

        // Notifica visiva
        Alert.alert(
          '🎉 Milestone raggiunto!',
          `Hai perso ${dropped.toFixed(1)} kg dall'ultimo controllo.\nTotale perso: ${totalLost > 0 ? totalLost : dropped.toFixed(1)} kg. Continua così!`,
          [{ text: 'Grazie! 💪', style: 'default' }]
        );

        // Audio: speakMessage('weight_milestone') — attivo quando i file MP3 saranno generati
        // speakMessage('weight_milestone', { name: userProfile.name });
        console.log(`[Milestone] Peso sceso di ${dropped.toFixed(1)} kg → nuovo baseline: ${newWeight} kg`);
      }
    } catch (e) {
      console.log('[Milestone] checkWeightMilestone error:', e);
    }
  };

  // --- EQUIVALENZE POST-ALLENAMENTO (formato: messaggio random singolo) ---
  const getCalorieEquivalence = (kcal: number) => {
    const viable = CALORIE_EQUIVALENCES.filter(eq => eq.kcal <= kcal * 1.3 && eq.kcal >= kcal * 0.5);
    if (viable.length === 0) return null;
    return viable[Math.floor(Math.random() * viable.length)];
  };

  const checkGPSPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      // Verifica anche che i servizi di localizzazione siano attivi
      const enabled = await Location.hasServicesEnabledAsync();
      setGpsAvailable(enabled);
    } else {
      setGpsAvailable(false);
    }
  };

  const checkPedometerAvailability = async () => {
    const isAvailable = await Pedometer.isAvailableAsync();
    setPedometerAvailable(isAvailable);
  };

  // Program generation (same as v2)
  const generateProgram = (profile: UserProfile) => {
    const weightDiff = profile.weight - profile.targetWeight;
    const deficit = profile.weightLossSpeed === 'moderate' ? 3850 : 7700;
    const weeks = Math.ceil((weightDiff * 7700) / deficit);
    
    setWeeklyDeficit(deficit);
    setWeeksToGoal(weeks);

    const programs: WeeklyProgram[] = [];
    for (let week = 1; week <= weeks; week++) {
      programs.push(generateWeekProgram(week, profile, deficit));
    }
    setWeeklyProgram(programs);
    weeklyProgramRef.current = programs;

    // Initialize weight history if empty
    if (weightHistory.length === 0) {
      setWeightHistory([{
        date: new Date().toISOString(),
        weight: profile.weight
      }]);
    }
  };

  const generateWeekProgram = (week: number, profile: UserProfile, weeklyDeficit: number): WeeklyProgram => {
    // Usa la progressione del piano attivo
    const activeProgressionTable = getActiveProgression();
    // Cap alla settimana massima disponibile per questo piano
    const maxWeek = Math.max(...Object.keys(activeProgressionTable).map(Number));
    const weekKey = Math.min(week, maxWeek);
    const prog = activeProgressionTable[weekKey] || activeProgressionTable[maxWeek];
    
    const warmupDuration = prog.warmup;
    const cooldownDuration = prog.cooldown;
    const fastDuration = prog.fastMin * prog.reps;
    // Se ci sono fasi veloci: N sostenute nel loop + 1 finale. Altrimenti: solo quelle nel loop.
    const moderateDuration = prog.fastMin > 0 ? prog.modMin * (prog.reps + 1) : prog.modMin * prog.reps;
    const totalDuration = warmupDuration + moderateDuration + fastDuration + cooldownDuration;

    // Velocità per livello
    const level = profile.fitnessLevel || 'beginner';
    const speeds = SPEED_BY_LEVEL[level] || SPEED_BY_LEVEL.beginner;

    const intervals: WorkoutInterval[] = [];
    
    // Riscaldamento
    intervals.push({ 
      type: 'warmup', duration: warmupDuration, speed: 'slow', 
      name: `Riscaldamento`, color: '#FFA726' 
    });

    // Intervalli alternati: sostenuta → veloce → sostenuta → veloce → ... → sostenuta
    for (let i = 0; i < prog.reps; i++) {
      intervals.push({ 
        type: 'walking', duration: prog.modMin, speed: 'moderate', 
        name: `Sostenuta`, color: '#42A5F5' 
      });
      if (prog.fastMin > 0) {
        intervals.push({ 
          type: 'walking', duration: prog.fastMin, speed: 'fast', 
          name: `Veloce`, color: '#EF5350' 
        });
      }
    }
    // Ultimo intervallo sostenuto prima del defaticamento (solo se ci sono fasi veloci)
    if (prog.fastMin > 0) {
      intervals.push({ 
        type: 'walking', duration: prog.modMin, speed: 'moderate', 
        name: `Sostenuta`, color: '#42A5F5' 
      });
    }

    // Defaticamento
    intervals.push({ 
      type: 'cooldown', duration: cooldownDuration, speed: 'slow', 
      name: `Defaticamento`, color: '#29B6F6' 
    });

    const caloriesPerSession = calculateCaloriesMET(profile.weight, warmupDuration, moderateDuration, fastDuration, cooldownDuration);
    const sessionsPerWeek = profile.trainingDays.length;
    const weeklyCaloriesBurned = caloriesPerSession * sessionsPerWeek;
    const coveragePercent = Math.round((weeklyCaloriesBurned / weeklyDeficit) * 100);

    return { week, totalDuration: Math.round(totalDuration), intervals, estimatedCalories: Math.round(caloriesPerSession), coveragePercent };
  };

  const calculateCaloriesMET = (weight: number, warmupMin: number, moderateMin: number, fastMin: number, cooldownMin: number): number => {
    // MET × peso (kg) × durata (ore) = kcal
    return (MET_VALUES.slow * weight * (warmupMin / 60)) +
           (MET_VALUES.moderate * weight * (moderateMin / 60)) +
           (MET_VALUES.fast * weight * (fastMin / 60)) +
           (MET_VALUES.slow * weight * (cooldownMin / 60));
  };

  // Calcolo BMI
  const calculateBMI = (weight: number, heightCm: number): number => {
    const heightM = heightCm / 100;
    return weight / (heightM * heightM);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Ref per tenere traccia del suono corrente
  const currentPlayerRef = useRef<any>(null);

  // Determina la cartella audio: voce scelta + genere utente
  // Legge da userProfileRef (sempre aggiornato) per evitare stale closure nei setTimeout
  const getAudioFolder = (): string => {
    const profile = userProfileRef.current || userProfile;
    let voicePref = profile.voicePreference || 'female';
    if (voicePref !== 'female' && voicePref !== 'male') voicePref = 'female';
    const gender = (profile.gender || 'M').toLowerCase();
    return `${voicePref}_${gender}`;
  };

  // ─── AUDIO ENGINE ──────────────────────────────────────────────────
  // Helper: pronuncia il nome via TTS e attendi (timeout di sicurezza 2s)
  // speakNameAndWait: riproduce il nome utente via MP3 ElevenLabs pre-generato.
  // Sequenza: legge il file locale → playAndWait → silenzio su qualsiasi errore.
  // NON usa TTS iOS: la voce deve essere coerente con Matteo/Tammy.
  const speakNameAndWait = async (): Promise<void> => {
    const profile = userProfileRef.current || userProfile;
    const name = profile.name?.trim();
    if (!name) return; // nessun nome impostato → silenzio

    const voiceKey = (profile.voicePreference || 'female') as 'male' | 'female';
    const path = getNameAudioPath(voiceKey);

    try {
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) {
        // File non ancora generato (prima sessione o errore di rete) → silenzio
        console.log('[FW Name] MP3 nome non trovato → silenzio:', path);
        return;
      }
      // Riproduce il file MP3 del nome e attende la fine
      await playAndWait({ uri: path });
    } catch (e) {
      // Qualsiasi errore (file corrotto, player fallito) → silenzio, mai crash
      console.warn('[FW Name] speakNameAndWait errore (silenzio):', e);
    }
  };

  // Helper: crea un player pulendo il precedente con .remove() (API corretta expo-audio)
  // async perché serve un delay di 50ms tra createAudioPlayer e play() per il caricamento
  const startAudioPlayer = async (audioFile: any): Promise<boolean> => {
    try {
      // Cleanup del player precedente con il metodo corretto (expo-audio usa .remove(), non .release())
      if (currentPlayerRef.current) {
        try { currentPlayerRef.current.remove(); } catch (e) {}
        currentPlayerRef.current = null;
      }
      // 30ms: lascia a iOS il tempo di rilasciare la sessione audio
      await new Promise(resolve => setTimeout(resolve, 30));
      const player = createAudioPlayer(audioFile);
      currentPlayerRef.current = player;
      // 50ms: il player deve caricare il file prima che play() funzioni
      await new Promise(resolve => setTimeout(resolve, 50));
      player.play();
      console.log('[FW Audio] ▶ player avviato');
      return true;
    } catch (e) {
      console.warn('[FW Audio] startAudioPlayer error:', e);
      return false;
    }
  };

  // Helper: avvia un player e attende la fine della riproduzione tramite evento didJustFinish
  // Timeout di sicurezza a 15s per evitare blocchi
  const playAndWait = (audioFile: any): Promise<boolean> => {
    return new Promise(async (resolve) => {
      try {
        if (currentPlayerRef.current) {
          try { currentPlayerRef.current.remove(); } catch (e) {}
          currentPlayerRef.current = null;
        }
        await new Promise(r => setTimeout(r, 30));
        const player = createAudioPlayer(audioFile);
        currentPlayerRef.current = player;
        await new Promise(r => setTimeout(r, 50));

        const timeout = setTimeout(() => {
          disposer?.remove();
          resolve(true);
        }, 15000);

        const disposer = player.addListener('playbackStatusUpdate', (status: any) => {
          if (status.didJustFinish) {
            clearTimeout(timeout);
            disposer.remove();
            resolve(true);
          }
        });

        player.play();
      } catch (e) {
        console.warn('[FW Audio] playAndWait error:', e);
        resolve(false);
      }
    });
  };

  // playPhaseAnnouncement: annuncia una nuova fase con architettura seg1 → durata → seg2
  // category: 'warmup_announce' | 'moderate_announce' | 'fast_announce' | 'cooldown_announce'
  // durationMinutes: durata della fase in minuti (per scegliere il file Q01 corretto)
  const playPhaseAnnouncement = async (
    category: 'warmup_announce' | 'moderate_announce' | 'fast_announce' | 'cooldown_announce',
    durationMinutes: number
  ): Promise<void> => {
    const folder = getAudioFolder();
    const files = AUDIO_FILES[folder];
    if (!files) { console.warn('[FW Phase] folder non trovata:', folder); return; }

    const variantCount = AUDIO_VARIANT_COUNT[category] ?? 1;
    const variant = Math.floor(Math.random() * variantCount) + 1;
    const vStr = String(variant).padStart(2, '0');

    const seg1File = files[`${category}_${vStr}_seg1`];
    const seg2File = files[`${category}_${vStr}_seg2`];
    const durationIdx = String(getDurationFileIndex(durationMinutes)).padStart(2, '0');
    const durationFile = files[`Q01_duration_${durationIdx}`];

    if (!seg1File) {
      console.warn('[FW Phase] seg1 non trovato:', category, variant);
      return;
    }

    console.log(`[FW Phase] ${category} v${variant} | durata ${durationMinutes}min → Q01_${durationIdx}`);

    // Blocca tutti i messaggi coaching mentre parla il cambio fase
    isPlayingPhaseAnnouncementRef.current = true;
    lastPhaseTransitionTimeRef.current = Date.now();

    try {
      // Nome PRIMA — indirizzo diretto all'utente, poi il messaggio
      await speakNameAndWait();
      // Delay per dare tempo all'audio system di rilasciare il player del nome
      await new Promise(r => setTimeout(r, 150));
      // seg1 ("Ora camminata veloce")
      console.log(`[FW Phase] riproduco seg1: ${category}_${vStr}_seg1`);
      await playAndWait(seg1File);
      // Q01 ("per X minuti")
      if (durationFile) {
        await new Promise(r => setTimeout(r, 30));
        await playAndWait(durationFile);
      }
      // seg2 (dettaglio fase)
      if (seg2File) {
        await new Promise(r => setTimeout(r, 30));
        await playAndWait(seg2File);
      }
      console.log(`[FW Phase] annuncio completato: ${category}`);
    } finally {
      // Sblocca i messaggi coaching solo dopo la fine del discorso
      isPlayingPhaseAnnouncementRef.current = false;
    }
  };

  // ─── GENERAZIONE AUDIO NOME VIA ELEVENLABS ───────────────────────────────
  // Genera i file MP3 del nome utente per ENTRAMBE le voci (Matteo + Tammy).
  // Li salva in DocumentDirectory/fitwalk_audio/nome_{male|female}.mp3
  // Ritorna true se entrambi generati con successo, false su errore/rete assente.
  const generateNameAudio = async (name: string): Promise<boolean> => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      console.log('[FW Name] nome vuoto, skip generazione');
      return false;
    }

    try {
      setIsGeneratingNameAudio(true);
      console.log('[FW Name] generazione audio per:', trimmedName);

      // Assicura che la cartella esista
      const dirInfo = await FileSystem.getInfoAsync(NAME_AUDIO_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(NAME_AUDIO_DIR, { intermediates: true });
        console.log('[FW Name] directory creata:', NAME_AUDIO_DIR);
      }

      // Genera in parallelo per male (MATTEO) e female (TAMMY)
      const results = await Promise.allSettled(
        (['male', 'female'] as const).map(async (voiceKey) => {
          const voiceId = ELEVENLABS_VOICE_IDS[voiceKey];
          const outputPath = getNameAudioPath(voiceKey);

          const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            {
              method: 'POST',
              headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg',
              },
              body: JSON.stringify({
                text: trimmedName + ',',  // virgola finale: riduce il silenzio tra nome e frase successiva
                model_id: ELEVENLABS_NAME_VOICE_SETTINGS.model_id,
                voice_settings: ELEVENLABS_NAME_VOICE_SETTINGS.voice_settings,
              }),
            }
          );

          if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`ElevenLabs HTTP ${response.status}: ${errText.slice(0, 120)}`);
          }

          // Legge il corpo come ArrayBuffer e converte in base64
          const buffer = await response.arrayBuffer();
          if (buffer.byteLength < 100) {
            throw new Error(`Risposta ElevenLabs troppo corta (${buffer.byteLength} bytes)`);
          }
          const base64 = arrayBufferToBase64(buffer);

          // Scrive il file MP3 in locale
          await FileSystem.writeAsStringAsync(outputPath, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });

          console.log(`[FW Name] ✅ ${voiceKey} → ${outputPath} (${buffer.byteLength} bytes)`);
        })
      );

      // Controlla se almeno la voce corrente è stata generata
      const allOk = results.every(r => r.status === 'fulfilled');
      if (!allOk) {
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            console.warn(`[FW Name] ❌ voce ${i === 0 ? 'male' : 'female'}:`, r.reason);
          }
        });
      }
      return allOk;

    } catch (e) {
      console.warn('[FW Name] generateNameAudio errore globale:', e);
      return false;
    } finally {
      setIsGeneratingNameAudio(false);
    }
  };

  // Controlla se i file MP3 del nome esistono sul dispositivo.
  // Se mancano (es. primo avvio dopo reinstallazione), li rigenera silenziosamente.
  const checkAndRegenerateNameAudio = async (name: string): Promise<void> => {
    if (!name.trim()) return;
    try {
      const [matteoInfo, tammyInfo] = await Promise.all([
        FileSystem.getInfoAsync(getNameAudioPath('male')),
        FileSystem.getInfoAsync(getNameAudioPath('female')),
      ]);
      if (!matteoInfo.exists || !tammyInfo.exists) {
        console.log('[FW Name] file mancanti → rigenerazione in background');
        generateNameAudio(name).catch(e =>
          console.warn('[FW Name] rigenerazione background fallita:', e)
        );
      } else {
        console.log('[FW Name] file nome presenti ✅');
      }
    } catch (e) {
      console.warn('[FW Name] checkAndRegenerateNameAudio errore:', e);
    }
  };

  // playAudio: riproduce un MP3 per categoria
  // – Single file: cleanup → crea player → play
  // – Segmented: seg1 → nome MP3 → seg2
  // Ritorna true se MP3 trovato e avviato, false → speakMessage userà TTS fallback
  const playAudio = async (category: string): Promise<boolean> => {
    const folder = getAudioFolder();
    const variantCount = AUDIO_VARIANT_COUNT[category];
    if (!variantCount) {
      console.log('[FW Audio] nessun variant count per:', category, '→ TTS');
      return false;
    }

    // Selezione variante anti-ripetizione: evita di ripetere l'ultima variante usata
    let variant: number;
    if (variantCount === 1) {
      variant = 1;
    } else {
      const last = lastVariantRef.current[category] ?? 0;
      let attempts = 0;
      do {
        variant = Math.floor(Math.random() * variantCount) + 1;
        attempts++;
      } while (variant === last && attempts < 5);
    }
    lastVariantRef.current[category] = variant;

    const files = AUDIO_FILES[folder];
    if (!files) {
      console.warn('[FW Audio] cartella non trovata:', folder);
      return false;
    }

    const singleKey = `${category}_${variant}`;

    // ── PERCORSO 1: FILE SINGOLO (bundled + nuovi senza {name}) ──
    const singleFile = files[singleKey];
    if (singleFile) {
      console.log('[FW Audio] single:', singleKey, folder);
      const ok = await startAudioPlayer(singleFile);
      console.log('[FW Audio]', ok ? '✅' : '❌', singleKey);
      return ok;
    }

    // ── PERCORSO 2: FILE SEGMENTATO — seg1 → nome → seg2 (struttura originale dei file) ──
    const seg1File = files[`${singleKey}_seg1`];
    if (seg1File) {
      const seg2File = files[`${singleKey}_seg2`];
      console.log('[FW Audio] seg:', singleKey, folder);

      // seg1 (testo prima del placeholder {name})
      const seg1ok = await playAndWait(seg1File);
      if (!seg1ok) {
        console.warn('[FW Audio] seg1 fallito');
        return false;
      }

      // nome nel mezzo della frase (come progettato nei file audio)
      await new Promise(resolve => setTimeout(resolve, 30));
      await speakNameAndWait();

      // seg2 (testo dopo il placeholder {name})
      if (seg2File) {
        await new Promise(resolve => setTimeout(resolve, 30));
        await playAndWait(seg2File);
      }
      return true;
    }

    console.log('[FW Audio] file non trovato:', singleKey, 'in', folder);
    return false;
  };

  // playAudioWithName: alias mantenuto per compatibilità con chiamate esistenti
  const playAudioWithName = async (category: string): Promise<boolean> => {
    return playAudio(category);
  };

  const getMessage = (category: string, variables: any = {}) => {
    const templates = MESSAGES[category];
    if (!templates || templates.length === 0) return '';
    const template = templates[Math.floor(Math.random() * templates.length)];
    let message = template;
    Object.keys(variables).forEach(key => {
      message = message.replace(new RegExp(`{${key}}`, 'g'), String(variables[key]));
    });
    const gender = userProfile.gender || 'M';
    const adjectives = ADJECTIVES[gender] || ADJECTIVES['M'];
    Object.keys(adjectives).forEach(adj => {
      message = message.replace(new RegExp(`{${adj}}`, 'g'), adjectives[adj]);
    });
    return message;
  };

  // speakMessage: riproduce il file ElevenLabs per la categoria.
  // Se MP3 non trovato → silenzio. Nessun fallback TTS.
  const speakMessage = async (category: string, variables: any = {}) => {
    lastSpeakTimeRef.current = Date.now();
    await playAudioWithName(category);
  };

  const vibrate = (intensity: 'light' | 'medium' | 'heavy') => {
    try {
      switch(intensity) {
        case 'light': Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); break;
        case 'medium': Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); break;
        case 'heavy':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 150);
          break;
      }
    } catch (error) {
      console.log('Haptics not available:', error);
    }
  };

  // Badge checking - Fitness + Weather + Time
  const checkAndUnlockBadges = (workout: WorkoutRecord) => {
    const updatedBadges = [...badges];
    let newUnlocks: Badge[] = [];
    const weather = workout.weather || weatherRef.current;

    const unlockBadge = (id: string, progress?: number) => {
      const badge = updatedBadges.find(b => b.id === id);
      if (badge && !badge.unlocked) {
        badge.unlocked = true;
        badge.progress = progress ?? badge.target;
        badge.unlockedDate = new Date().toISOString();
        newUnlocks.push(badge);
      }
    };

    const updateProgress = (id: string, progress: number) => {
      const badge = updatedBadges.find(b => b.id === id);
      if (badge && !badge.unlocked) {
        badge.progress = progress;
        if (progress >= badge.target) {
          badge.unlocked = true;
          badge.unlockedDate = new Date().toISOString();
          newUnlocks.push(badge);
        }
      }
    };

    // ===== FITNESS BADGES =====
    unlockBadge('first_workout');
    if (workout.steps >= 10000) unlockBadge('steps_10k', workout.steps);

    const totalDistance = workoutHistory.reduce((sum, w) => sum + parseFloat(w.distance), 0) + parseFloat(workout.distance);
    updateProgress('distance_5k', totalDistance);

    const avgSpeed = parseFloat(workout.distance) / (workout.duration / 3600);
    if (avgSpeed >= 6) unlockBadge('speed_demon');

    const streak = calculateStreak([...workoutHistory, workout]);
    updateProgress('streak_7', streak);

    // ===== WEATHER BADGES =====
    if (weather) {
      if (weather.weather === 'rain' || weather.weather === 'drizzle') unlockBadge('rain_walker');
      if (weather.temp_c < 5) unlockBadge('ice_walker');
      if (weather.temp_c > 30) unlockBadge('heat_warrior');
      if (weather.wind_kmh > 20) unlockBadge('wind_rider');

      // Unstoppable - count adverse weather workouts
      if (isAdverseWeather(weather)) {
        const adverseCount = workoutHistory.filter(w => w.weather && isAdverseWeather(w.weather)).length + 1;
        updateProgress('unstoppable', adverseCount);
      }

      // All Weather - track weather conditions seen
      const allHistory = [...workoutHistory, workout];
      const hasSun = allHistory.some(w => w.weather?.weather === 'clear');
      const hasRain = allHistory.some(w => w.weather?.weather === 'rain' || w.weather?.weather === 'drizzle');
      const hasCold = allHistory.some(w => w.weather && w.weather.temp_c < 10);
      const hasHot = allHistory.some(w => w.weather && w.weather.temp_c > 25);
      updateProgress('all_weather', [hasSun, hasRain, hasCold, hasHot].filter(Boolean).length);

      // ===== TIME BADGES =====
      const timeCategory = getTimeCategory(weather);
      const startHour = parseInt(weather.local_time.split(':')[0]);

      if (startHour < 7) unlockBadge('early_bird');
      if (startHour >= 21) unlockBadge('night_owl');

      if (timeCategory === 'pre_dawn' || timeCategory === 'dawn') {
        const cnt = workoutHistory.filter(w => w.weather && ['pre_dawn', 'dawn'].includes(getTimeCategory(w.weather!))).length + 1;
        updateProgress('dawn_patrol', cnt);
      }
      if (timeCategory === 'sunset') {
        const cnt = workoutHistory.filter(w => w.weather && getTimeCategory(w.weather!) === 'sunset').length + 1;
        updateProgress('sunset_lover', cnt);
      }
      if (timeCategory === 'lunch') {
        const cnt = workoutHistory.filter(w => w.weather && getTimeCategory(w.weather!) === 'lunch').length + 1;
        updateProgress('lunch_hero', cnt);
      }

      // Four Seasons
      const getSeason = (d: string) => { const m = new Date(d).getMonth(); return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter'; };
      updateProgress('four_seasons', new Set(allHistory.map(w => getSeason(w.date))).size);
    }

    setBadges(updatedBadges);

    // Show unlock notifications with audio
    if (newUnlocks.length > 0) {
      setTimeout(() => {
        newUnlocks.forEach((badge, index) => {
          setTimeout(() => {
            speakMessage('badge_' + badge.id, { name: userProfile.name });
            Alert.alert('Badge Sbloccato!', badge.icon + ' ' + badge.title + '\n' + badge.tagline, [{ text: 'Fantastico!' }]);
            vibrate('heavy');
          }, index * 3000);
        });
      }, 2000);
    }
  };

  const calculateStreak = (history: WorkoutRecord[]): number => {
    if (history.length === 0) return 0;
    
    const sortedDates = history
      .map(w => new Date(w.date).toDateString())
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    
    let streak = 1;
    let currentDate = new Date(sortedDates[0]);
    
    for (let i = 1; i < sortedDates.length; i++) {
      const prevDate = new Date(currentDate);
      prevDate.setDate(prevDate.getDate() - 1);
      
      if (new Date(sortedDates[i]).toDateString() === prevDate.toDateString()) {
        streak++;
        currentDate = new Date(sortedDates[i]);
      } else {
        break;
      }
    }
    
    return streak;
  };

  // Onboarding
  const nextOnboardingStep = () => {
    if (onboardingStep < 9) {
      setOnboardingStep(onboardingStep + 1);
    } else {
      completeOnboarding();
    }
  };

  const prevOnboardingStep = () => {
    if (onboardingStep > 1) setOnboardingStep(onboardingStep - 1);
  };

  const completeOnboarding = async () => {
    const profileWithDate = {
      ...userProfile,
      startDate: new Date().toISOString()
    };
    setUserProfile(profileWithDate);
    generateProgram(profileWithDate);
    saveAllData({ profile: profileWithDate });
    setCurrentScreen('dashboard');
    setOnboardingStep(1);

    // Genera i file MP3 del nome in background (non blocca la navigazione).
    // Se la rete è assente, speakNameAndWait restituirà silenzio — nessun crash.
    if (profileWithDate.name?.trim()) {
      generateNameAudio(profileWithDate.name).then(ok => {
        console.log('[FW Name] onboarding generation:', ok ? '✅' : '❌ (silenzio al posto del nome)');
      }).catch(e => console.warn('[FW Name] onboarding generation catch:', e));
    }
  };

  const toggleTrainingDay = (day: number) => {
    const days = userProfile.trainingDays.includes(day)
      ? userProfile.trainingDays.filter(d => d !== day)
      : [...userProfile.trainingDays, day].sort((a, b) => a - b);
    setUserProfile({ ...userProfile, trainingDays: days });
  };

  // ============= WEATHER & ENVIRONMENT FUNCTIONS =============
  const fetchWeatherData = async (): Promise<WeatherData | null> => {
    try {
      const location = await Location.getLastKnownPositionAsync();
      if (!location) return null;

      const { latitude, longitude } = location.coords;
      const OPENWEATHER_API_KEY = 'Y73a0bd59027059a9ac4c6481117411a7'; // TODO: sostituire con chiave reale
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=it`;

      const response = await fetch(url);
      if (!response.ok) return null;
      const data = await response.json();

      const now = new Date();
      const sunrise = new Date(data.sys.sunrise * 1000);
      const sunset = new Date(data.sys.sunset * 1000);
      const pad = (n: number) => n.toString().padStart(2, '0');
      const sunriseStr = `${pad(sunrise.getHours())}:${pad(sunrise.getMinutes())}`;
      const sunsetStr = `${pad(sunset.getHours())}:${pad(sunset.getMinutes())}`;
      const localTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const isDark = now.getTime() < (sunrise.getTime() - 30 * 60000) || now.getTime() > (sunset.getTime() + 30 * 60000);

      const weatherMain = data.weather[0]?.main?.toLowerCase() || 'clear';
      const weatherMap: { [key: string]: string } = {
        thunderstorm: 'thunderstorm', drizzle: 'drizzle', rain: 'rain',
        snow: 'snow', mist: 'mist', fog: 'fog', haze: 'mist',
        clouds: 'clouds', clear: 'clear',
      };

      return {
        weather: weatherMap[weatherMain] || 'clear',
        temp_c: Math.round(data.main.temp),
        humidity: data.main.humidity,
        wind_kmh: Math.round((data.wind?.speed || 0) * 3.6),
        sunrise: sunriseStr,
        sunset: sunsetStr,
        local_time: localTimeStr,
        is_dark: isDark,
        description: data.weather[0]?.description || '',
      };
    } catch (error) {
      console.log('Weather fetch failed:', error);
      return null;
    }
  };

  const isAdverseWeather = (w: WeatherData): boolean => {
    return w.weather === 'rain' || w.weather === 'drizzle' ||
           w.weather === 'snow' || w.weather === 'thunderstorm' ||
           w.temp_c < 5 || w.temp_c > 30 || w.wind_kmh > 20;
  };

  const getTimeCategory = (w: WeatherData): string => {
    const [h, m] = w.local_time.split(':').map(Number);
    const timeMin = h * 60 + m;
    const [sh, sm] = w.sunrise.split(':').map(Number);
    const sunriseMin = sh * 60 + sm;
    const [eth, etm] = w.sunset.split(':').map(Number);
    const sunsetMin = eth * 60 + etm;

    if (timeMin < sunriseMin - 20) return 'pre_dawn';
    if (timeMin <= sunriseMin + 20) return 'dawn';
    if (timeMin >= 720 && timeMin <= 840) return 'lunch';
    if (timeMin >= sunsetMin - 20 && timeMin <= sunsetMin + 20) return 'sunset';
    if (timeMin > sunsetMin + 30) return 'night';
    if (h < 7) return 'early_morning';
    if (h >= 21) return 'late_night';
    return 'normal';
  };

  // Workout functions
  const startWorkout = async () => {
    // Check premium — la prima camminata è gratis, poi serve Premium
    if (!isPremium && workoutHistory.length >= 1) {
      setShowPaywall(true);
      return;
    }

    if (!indoorMode && !gpsAvailable) {
      Alert.alert(
        'GPS non disponibile', 
        'Attiva il GPS per tracciare l\'allenamento all\'aperto, oppure usa la modalità indoor.',
        [
          { text: 'Annulla', style: 'cancel', onPress: () => { isWorkoutStartingRef.current = false; } },
          { text: 'Modalità Indoor', onPress: () => { setIndoorMode(true); isWorkoutStartingRef.current = false; } }
        ]
      );
      return;
    }

    // Fetch weather data (non-blocking)
    if (!indoorMode) {
      fetchWeatherData().then(weather => {
        if (weather) {
          setCurrentWeather(weather);
          weatherRef.current = weather;
          console.log('Weather:', weather.description, weather.temp_c + 'C, wind ' + weather.wind_kmh + 'km/h');

          // ===== TRIGGER: WEATHER + TIME COACHING =====
          if (!weatherCoachDoneRef.current) {
            weatherCoachDoneRef.current = true;
            setTimeout(() => {
              // Weather coaching — nessun messaggio per bel tempo (nessun file)
              const w = weather;
              if (w.weather === 'rain' || w.weather === 'drizzle') {
                speakMessage('weather_rain', { name: userProfile.name });
              } else if (w.temp_c < 5) {
                speakMessage('weather_cold', { name: userProfile.name });
              } else if (w.temp_c > 30) {
                speakMessage('weather_heat', { name: userProfile.name });
              } else if (w.wind_kmh > 20) {
                speakMessage('weather_wind', { name: userProfile.name });
              }
              // Time of day coaching (1.2 sec dopo weather)
              // H01 predawn <5h, H02 dawn 5-7h, H03 lunch 11-14h, H04 sunset 17-20h, H05 night ≥20h
              setTimeout(() => {
                const hour = new Date().getHours();
                if (hour < 5) {
                  speakMessage('time_predawn', { name: userProfile.name });
                } else if (hour < 7) {
                  speakMessage('time_dawn', { name: userProfile.name });
                } else if (hour >= 11 && hour < 14) {
                  speakMessage('time_lunch', { name: userProfile.name });
                } else if (hour >= 17 && hour < 20) {
                  speakMessage('time_sunset', { name: userProfile.name });
                } else if (hour >= 20) {
                  speakMessage('time_night', { name: userProfile.name });
                }
                // 7-11h e 14-17h: nessun coaching orario specifico
              }, 1200);
            }, 12000); // 12 sec dopo il workout_start
          }
        }
      });
    }

    const todayProgram = weeklyProgram[currentWeek - 1];
    if (!todayProgram) return;

    if (pedometerAvailable) {
      try {
        const end = new Date();
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const pastStepCountResult = await Pedometer.getStepCountAsync(start, end);
        if (pastStepCountResult) initialStepsRef.current = pastStepCountResult.steps;
      } catch (error) {
        initialStepsRef.current = 0;
      }
    }

    setSessionData({
      phase: 'warmup',
      elapsed: 0,
      distance: 0,
      pace: 0,
      isActive: true,
      lastPosition: null,
      currentSpeed: 0,
      currentIntervalIndex: 0,
      steps: 0,
      cadence: 0,
      route: [],
      lastKmAnnounced: 0,
      realStartTime: Date.now()
    });
    currentIntervalIndexRef.current = 0;
    elapsedRef.current = 0;
    setIsWorkoutActive(true);

    setCurrentScreen('workout');
    vibrate('heavy');
    
    speakMessage('workout_start', {
      name: userProfile.name,
      duration: 5,
      total_duration: todayProgram ? todayProgram.totalDuration : 35
    });

    // ===== TRIGGER: COMEBACK =====
    if (!combackAnnouncedRef.current && workoutHistory.length > 0) {
      const lastDate = new Date(workoutHistory[0].date);
      const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince >= 7) {
        setTimeout(() => speakMessage('comeback_long', { name: userProfile.name }), 6000);
        combackAnnouncedRef.current = true;
      } else if (daysSince >= 3) {
        setTimeout(() => speakMessage('comeback_short', { name: userProfile.name }), 6000);
        combackAnnouncedRef.current = true;
      }
    }

    // ===== TRIGGER: STREAK =====
    const currentStreak = calculateStreak(workoutHistory);
    if (currentStreak !== streakAnnouncedRef.current) {
      if (currentStreak === 3) {
        setTimeout(() => { speakMessage('streak_3', { name: userProfile.name }); streakAnnouncedRef.current = 3; }, 8000);
      } else if (currentStreak === 14) {
        setTimeout(() => { speakMessage('streak_14', { name: userProfile.name }); streakAnnouncedRef.current = 14; }, 8000);
      } else if (currentStreak === 30) {
        setTimeout(() => { speakMessage('streak_30', { name: userProfile.name }); streakAnnouncedRef.current = 30; }, 8000);
      }
    }

    // Reset trigger state
    lastBodyCoachRef.current = 0;
    lastSpeedCoachRef.current = 0;
    lastSciencePillRef.current = 0;
    lastSpeakTimeRef.current = 0;
    bodyCoachIndexRef.current = 0;
    sciencePillIndexRef.current = 0;
    lastAltitudeRef.current = null;
    // Protegge i primi 15 secondi dal workout: nessun messaggio coaching sovrapposto al workout_start
    lastPhaseTransitionTimeRef.current = Date.now();
    uphillActiveRef.current = false;
    weatherCoachDoneRef.current = false;
    
    if (!indoorMode) {
      startGPSTracking();
    }
    startPedometerTracking();
  };

  const startGPSTracking = async () => {
    try {
      // Richiedi permesso foreground (mantiene il "pillino" verde su iOS)
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      
      locationSubscription.current = await Location.watchPositionAsync(
        { 
          accuracy: Location.Accuracy.High, 
          timeInterval: 1000, 
          distanceInterval: 5,
          mayShowUserSettingsDialog: false,
        },
        (location) => updatePosition(location.coords)
      );
    } catch (error) {
      console.error('GPS error:', error);
    }
  };

  const startPedometerTracking = async () => {
    if (!pedometerAvailable) return;
    
    // Stima lunghezza passo basata su altezza (formula Hatano)
    const stepLengthKm = userProfile.height > 0 ? (userProfile.height * 0.415) / 100000 : 0.00065; // ~65cm default

    try {
      const stepInterval = setInterval(async () => {
        try {
          const end = new Date();
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          
          const result = await Pedometer.getStepCountAsync(start, end);
          if (result) {
            const workoutSteps = result.steps - initialStepsRef.current;
            
            // Aggiorna rilevamento movimento: se i passi sono aumentati → utente si sta muovendo
            if (workoutSteps > lastStepsForMovingRef.current) {
              lastStepsForMovingRef.current = workoutSteps;
              lastStepsTimeRef.current = Date.now();
            }

            setSessionData(prev => {
              if (!prev.isActive) return prev;
              const elapsedMinutes = prev.elapsed / 60;
              const cadence = elapsedMinutes > 0 ? Math.round(workoutSteps / elapsedMinutes) : 0;
              // In modalità indoor, stima la distanza dai passi
              const estimatedDistance = indoorMode ? workoutSteps * stepLengthKm : prev.distance;
              return { ...prev, steps: workoutSteps, cadence, distance: indoorMode ? estimatedDistance : prev.distance };
            });
          }
        } catch (error) {
          console.log('Step count update error:', error);
        }
      }, 2000);
      
      pedometerSubscription.current = { remove: () => clearInterval(stepInterval) };
    } catch (error) {
      console.error('Pedometer error:', error);
    }
  };

  // ─── RILEVAMENTO MOVIMENTO ────────────────────────────────────────────────
  // Ritorna true se l'utente si sta muovendo:
  //   - GPS speed > 0.3 m/s (≈1 km/h), OPPURE
  //   - Il contapassi ha rilevato nuovi passi negli ultimi 30 secondi
  // Usato per bloccare i messaggi "esortativi" quando l'utente è fermo.
  const isUserMoving = (): boolean => {
    // GPS: velocità rilevata superiore a soglia minima
    if (currentSpeedRef.current > 0.3) return true;
    // Pedometro: passi aggiornati negli ultimi 30 secondi
    const secondsSinceLastStep = (Date.now() - lastStepsTimeRef.current) / 1000;
    if (secondsSinceLastStep < 30) return true;
    return false;
  };

  const updatePosition = (coords: Location.LocationObjectCoords) => {
    // Filtra letture GPS imprecise (rumore da fermo): ignora se accuracy > 20m
    if (coords.accuracy !== null && coords.accuracy !== undefined && coords.accuracy > 20) {
      return;
    }
    const speed = coords.speed || 0;
    currentSpeedRef.current = speed; // aggiorna ref velocità

    // ===== UPHILL DETECTION =====
    if (coords.altitude !== null && coords.altitude !== undefined) {
      if (lastAltitudeRef.current !== null) {
        const altDiff = coords.altitude - lastAltitudeRef.current;
        if (altDiff > 5 && !uphillActiveRef.current) {
          // Salita rilevata: solo durante fasi walking attive E se l'utente si sta muovendo
          const todayProg = weeklyProgramRef.current[currentWeek - 1];
          const curInterval = todayProg?.intervals[currentIntervalIndexRef.current];
          const isWalking = curInterval?.type === 'walking';
          if (isWalking && isUserMoving()) {
            uphillActiveRef.current = true;
            speakMessage('uphill', { name: userProfile.name });
            setTimeout(() => { uphillActiveRef.current = false; }, 90000); // reset dopo 90 sec
          }
        } else if (altDiff < -3) {
          uphillActiveRef.current = false; // in discesa, resetta
        }
      }
      lastAltitudeRef.current = coords.altitude;
    }

    setSessionData(prev => {
      const newRoute = [...prev.route, { latitude: coords.latitude, longitude: coords.longitude }];
      if (!prev.lastPosition) return { ...prev, lastPosition: coords, route: newRoute };

      const distance = calculateDistance(
        prev.lastPosition.latitude, prev.lastPosition.longitude,
        coords.latitude, coords.longitude
      );

      const speed = coords.speed || 0; // stesso valore già in currentSpeedRef
      const shouldCount = distance >= 5 && speed > 0.5;
      const newDistance = shouldCount ? prev.distance + distance : prev.distance;
      const newDistanceKm = newDistance / 1000;
      const kmPassed = Math.floor(newDistanceKm);

      if (kmPassed > prev.lastKmAnnounced && kmPassed > 0) {
        const milestoneCategory = `milestone_${Math.min(kmPassed, 5)}km`;
        // Prova categoria specifica (milestone_2km, etc.), altrimenti usa generica
        if (MESSAGES[milestoneCategory]) {
          speakMessage(milestoneCategory, { name: userProfile.name });
        } else {
          const kmText = kmPassed === 1 ? 'chilometro' : 'chilometri';
          const kmTextCap = kmPassed === 1 ? 'Primo chilometro' : `${kmPassed} chilometri`;
          speakMessage('milestone_km', {
            name: userProfile.name,
            km: kmPassed,
            km_text: kmText,
            km_text_cap: kmTextCap
          });
        }
        vibrate('light');
      }

      // INCORAGGIAMENTO RITMO LENTO: se durante un intervallo veloce la velocità è bassa
      const now = Date.now();
      const todayProgram = weeklyProgram[currentWeek - 1];
      if (todayProgram && speed > 0 && speed < 0.83) { // sotto 3 km/h
        const currentInterval = todayProgram.intervals[prev.currentIntervalIndex];
        if (currentInterval && currentInterval.speed === 'fast') {
          // Max 1 incoraggiamento ogni 3 minuti
          if (now - lastEncouragementRef.current > 180000) {
            lastEncouragementRef.current = now;
            speakMessage('encouragement_slow', { name: userProfile.name });
          }
        }
      }

      return {
        ...prev,
        distance: newDistance,
        lastPosition: coords,
        currentSpeed: speed,
        pace: speed > 0 ? (1000 / 60) / (speed * 1000 / 60) : 0,
        route: newRoute,
        lastKmAnnounced: kmPassed
      };
    });
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  useEffect(() => {
    if (isWorkoutActive) {
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        const newElapsed = elapsedRef.current;

        // Aggiorna lo state
        setSessionData(prev => {
          sessionDataRef.current = { ...prev, elapsed: newElapsed };
          return { ...prev, elapsed: newElapsed };
        });

        // Invia dati al Watch ogni secondo
        sendWatchUpdate(newElapsed, true);

        // Check intervalli e messaggi FUORI dallo state updater
        checkIntervalChange(newElapsed);
        checkMotivationalMessages(newElapsed);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isWorkoutActive]);

  const checkIntervalChange = async (elapsed: number) => {
    if (isCheckingIntervalRef.current) return; // evita esecuzioni concorrenti
    isCheckingIntervalRef.current = true;
    try {
    const todayProgram = weeklyProgramRef.current[currentWeek - 1];
    if (!todayProgram) return;

    // Calcola durata totale del programma
    const totalProgramTime = Math.round(todayProgram.intervals.reduce((sum, interval) => sum + interval.duration * 60, 0));
    
    // Auto-complete quando il tempo è raggiunto
    if (elapsed >= totalProgramTime) {
      stopWorkout();
      return;
    }

    // Determina in quale intervallo ci troviamo in base al tempo trascorso
    let totalTime = 0;
    let targetIndex = 0;
    for (let i = 0; i < todayProgram.intervals.length; i++) {
      totalTime += Math.round(todayProgram.intervals[i].duration * 60);
      if (elapsed < totalTime) {
        targetIndex = i;
        break;
      }
    }

    // Leggi indice corrente dal ref (evita stale closure)
    const currentIndex = currentIntervalIndexRef.current;
    if (currentIndex === targetIndex) return;

    // Aggiorna ref e state
    currentIntervalIndexRef.current = targetIndex;
    setSessionData(prev => ({ ...prev, currentIntervalIndex: targetIndex }));

    const nextInterval = todayProgram.intervals[targetIndex];
    const prevInterval = todayProgram.intervals[currentIndex];
    console.log(`🔄 TRANSIZIONE: ${prevInterval?.name || 'start'} → ${nextInterval.name} (idx ${currentIndex}→${targetIndex}, elapsed ${elapsed}s)`);

    // Reset: nuovo intervallo = nuovo messaggio consentito
    phaseMessageSentRef.current = false;
    currentPhaseIndexRef.current = targetIndex;
    // Forza reset del flag anche se un annuncio precedente era ancora in corso
    // (può succedere se due transizioni sono molto ravvicinate)
    isPlayingPhaseAnnouncementRef.current = false;
    // Blocca SUBITO qualsiasi messaggio coaching — prima del setTimeout
    lastPhaseTransitionTimeRef.current = Date.now();
    isPlayingPhaseAnnouncementRef.current = true;

    // Mostra video preview solo quando cambia TIPO di fase
    const prevPhaseType = prevInterval ? (prevInterval.type === 'walking' ? prevInterval.speed : prevInterval.type) : '';
    const nextPhaseType = nextInterval.type === 'walking' ? nextInterval.speed : nextInterval.type;

    if (prevPhaseType !== nextPhaseType && userProfile.showVideoPreview !== false) {
      const phase = getPhaseVideo(nextInterval.type, nextInterval.speed);
      setPhasePreviewVideo(phase.video);
      setPhasePreviewTitle(phase.title);
      setPhasePreviewSub(phase.sub);
      setShowPhasePreview(true);
      // Auto-chiusura dopo 3 secondi
      setTimeout(() => setShowPhasePreview(false), 3000);
    }

    // Annuncia il nuovo intervallo con architettura seg1 → durata → seg2
    setTimeout(() => {
      if (nextInterval.type === 'warmup') {
        playPhaseAnnouncement('warmup_announce', nextInterval.duration);
        vibrate('light');
      } else if (nextInterval.speed === 'fast') {
        playPhaseAnnouncement('fast_announce', nextInterval.duration);
        vibrate('heavy');
      } else if (nextInterval.speed === 'moderate') {
        playPhaseAnnouncement('moderate_announce', nextInterval.duration);
        vibrate('medium');
      } else if (nextInterval.type === 'cooldown') {
        playPhaseAnnouncement('cooldown_announce', nextInterval.duration);
        vibrate('light');
      } else {
        // Nessun MP3 per questo caso: resetta il flag manualmente
        isPlayingPhaseAnnouncementRef.current = false;
        vibrate('light');
      }
    }, 200);
    } finally {
      isCheckingIntervalRef.current = false;
    }
  };

  const checkMotivationalMessages = (elapsed: number) => {
    const todayProgram = weeklyProgramRef.current[currentWeek - 1];
    if (!todayProgram) return;

    // ── GUARDIA GLOBALE: se sta parlando un annuncio di cambio fase, o siamo
    //    entro 15 secondi dall'ultima transizione, non sovrapporre NESSUN messaggio.
    if (isPlayingPhaseAnnouncementRef.current) return;
    if (Date.now() - lastPhaseTransitionTimeRef.current < 15000) return;

    const totalDuration = todayProgram.totalDuration * 60;
    const halfWay = Math.floor(totalDuration / 2);
    const quarterMark = Math.floor(totalDuration / 4);
    const threeQuarterMark = Math.floor((totalDuration * 3) / 4);
    const lastMinute = totalDuration - 60;
    const last30 = totalDuration - 30;
    const now = Date.now();

    // Fase corrente
    const currentIdxForCoach = currentIntervalIndexRef.current;
    const currentIntervalForCoach = todayProgram.intervals[currentIdxForCoach];
    const isActiveWalkingPhase = currentIntervalForCoach?.type === 'walking';

    // ===== PROGRESS MILESTONES =====
    // Questi messaggi richiedono che l'utente si stia muovendo (sono esortativi,
    // non ha senso dirli a qualcuno fermo alla scrivania)
    const moving = isUserMoving();
    // Anti-overlap: non sovrapporre milestone a messaggi già in riproduzione (8 sec di buffer)
    const recentlySpoke = (Date.now() - lastSpeakTimeRef.current) < 8000;

    if (elapsed === quarterMark && moving && !recentlySpoke) {
      speakMessage('quarter_done', { name: userProfile.name });
      vibrate('light');
    }
    if (elapsed === halfWay && moving && !recentlySpoke) {
      speakMessage('halfway', { name: userProfile.name });
      vibrate('medium');
    }
    if (elapsed === threeQuarterMark && moving && !recentlySpoke) {
      speakMessage('three_quarters', { name: userProfile.name });
      vibrate('medium');
    }
    if (elapsed === last30 && moving && !recentlySpoke) {
      speakMessage('last_30_seconds', { name: userProfile.name });
      vibrate('medium');
    }
    if (elapsed === lastMinute && moving && !recentlySpoke) {
      const currentInterval = todayProgram.intervals[currentIdxForCoach];
      if (currentInterval && currentInterval.type === 'cooldown') {
        speakMessage('last_minute_cooldown', { name: userProfile.name });
        vibrate('light');
      } else {
        speakMessage('last_minute', { name: userProfile.name });
        vibrate('heavy');
      }
    }

    // ===== BODY COACHING (ogni 8 minuti, dopo i primi 2 minuti di fase, max 1 per fase) =====
    // Solo durante fasi di camminata attiva + utente in movimento
    if (isActiveWalkingPhase && moving && elapsed > 120 && !phaseMessageSentRef.current && now - lastBodyCoachRef.current > 480000) {
      const bodyTypes: string[] = ['body_hydration', 'body_posture', 'body_breathing', 'body_cadence'];
      let bodyIdx = bodyCoachIndexRef.current % bodyTypes.length;
      let bodyType = bodyTypes[bodyIdx];

      // Idratazione: non prima di 20 minuti totali di allenamento (elapsed >= 1200s)
      if (bodyType === 'body_hydration' && elapsed < 1200) {
        // Salta l'idratazione, passa al prossimo tipo
        bodyIdx = (bodyIdx + 1) % bodyTypes.length;
        bodyType = bodyTypes[bodyIdx];
        // Se anche il prossimo è idratazione (lista di 1), esci
        if (bodyType === 'body_hydration') return;
      }

      lastBodyCoachRef.current = now;
      phaseMessageSentRef.current = true;
      bodyCoachIndexRef.current++;
      speakMessage(bodyType, { name: userProfile.name });
    }

    // ===== SCIENCE PILL (ogni 12 minuti, dopo i primi 3 minuti di fase, max 1 per fase) =====
    // Solo durante fasi di camminata attiva + utente in movimento
    if (isActiveWalkingPhase && moving && elapsed > 180 && !phaseMessageSentRef.current && now - lastSciencePillRef.current > 720000) {
      lastSciencePillRef.current = now;
      phaseMessageSentRef.current = true;
      const scienceTypes: string[] = ['science_cal', 'science_heart', 'science_metab', 'science_sleep', 'science_mood', 'science_body'];
      const scienceType = scienceTypes[sciencePillIndexRef.current % scienceTypes.length];
      sciencePillIndexRef.current++;
      speakMessage(scienceType, { name: userProfile.name });
    }

    // ===== SPEED COACHING (ogni 10 minuti, durante fasi veloci, max 1 per fase) =====
    // Solo se l'utente è in movimento (ha senso solo mentre cammina veloce)
    if (moving && elapsed > 60 && !phaseMessageSentRef.current && now - lastSpeedCoachRef.current > 600000) {
      const currentInterval = todayProgram.intervals[currentIdxForCoach];
      if (currentInterval?.speed === 'fast') {
        const spd = currentSpeedRef.current; // m/s
        lastSpeedCoachRef.current = now;
        phaseMessageSentRef.current = true;
        if (spd > 0.3 && spd < 5 / 3.6) {
          speakMessage('speed_too_slow', { name: userProfile.name });
        } else if (spd >= 5 / 3.6 && spd < 6.5 / 3.6) {
          speakMessage('speed_good', { name: userProfile.name });
        } else if (spd >= 6.5 / 3.6) {
          speakMessage('speed_fast', { name: userProfile.name });
        }
      }
    }
  };

  const togglePause = () => {
    const newActive = !isWorkoutActive;
    setReturnedFromBackground(false);
    setSessionData(prev => ({ ...prev, isActive: newActive }));
    setIsWorkoutActive(newActive);
    if (!newActive) {
      speakMessage('pause', { name: userProfile.name });
    } else {
      speakMessage('resume', { name: userProfile.name });
    }
  };

  // Invia dati aggiornati all'Apple Watch durante l'allenamento
  const sendWatchUpdate = (elapsed: number, active: boolean) => {
    try {
      const todayProgram = weeklyProgramRef.current[currentWeek - 1];
      if (!todayProgram) return;
      const idx = currentIntervalIndexRef.current;
      const interval = todayProgram.intervals[idx];
      if (!interval) return;

      let intervalStart = 0;
      for (let i = 0; i < idx; i++) {
        intervalStart += Math.round(todayProgram.intervals[i].duration * 60);
      }
      const intervalElapsed = elapsed - intervalStart;
      const intervalDuration = interval.duration * 60;
      const remaining = Math.max(0, intervalDuration - intervalElapsed);
      const progress = Math.min(1, intervalElapsed / intervalDuration);

      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      const timerStr = `${mins}:${secs.toString().padStart(2, '0')}`;

      const watchData = {
        phase: interval.name.toUpperCase(),
        timer: timerStr,
        progress: progress,
        isActive: active,
        steps: sessionDataRef.current?.steps ?? 0,
        calories: Math.round((sessionDataRef.current?.distance ?? 0) / 1000 * 65),
        intervalIndex: idx + 1,
        totalIntervals: todayProgram.intervals.length,
      };
      if (WatchModule?.isReachable) {
        WatchModule?.sendMessage(watchData,
          (err: any) => { if (err) WatchModule?.updateApplicationContext(watchData); }
        );
      } else {
        WatchModule?.updateApplicationContext(watchData);
      }
    } catch (e) {
      // Watch non connesso — silenzio
    }
  };

  const skipToPreviousInterval = () => {
    const todayProgram = weeklyProgramRef.current[currentWeek - 1];
    if (!todayProgram) { vibrate('light'); return; }

    // Se siamo al riscaldamento (index 0): ricomincia la fase corrente da capo
    if (sessionData.currentIntervalIndex === 0) {
      elapsedRef.current = 0;
      setSessionData(prev => ({ ...prev, elapsed: 0 }));
      const currentInterval = todayProgram.intervals[0];
      // Nessun audio per navigazione manuale (non ci sono MP3 per questo caso)
      vibrate('medium');
      return;
    }

    const prevIdx = sessionData.currentIntervalIndex - 1;

    // Calculate elapsed time at start of previous interval
    let elapsedAtPrevInterval = 0;
    for (let i = 0; i < prevIdx; i++) {
      elapsedAtPrevInterval += Math.round(todayProgram.intervals[i].duration * 60);
    }

    const currentInterval = todayProgram.intervals[sessionData.currentIntervalIndex];
    const targetInterval = todayProgram.intervals[prevIdx];

    // Aggiorna refs
    currentIntervalIndexRef.current = prevIdx;
    elapsedRef.current = elapsedAtPrevInterval;
    // Stessi reset che fa checkIntervalChange: blocca coaching per 15s e resetta flag fase
    lastPhaseTransitionTimeRef.current = Date.now();
    phaseMessageSentRef.current = false;
    isPlayingPhaseAnnouncementRef.current = true;

    setSessionData(prev => ({
      ...prev,
      currentIntervalIndex: prevIdx,
      elapsed: elapsedAtPrevInterval
    }));

    // Mostra video preview se cambia tipo di fase
    const currentPhaseType = currentInterval ? (currentInterval.type === 'walking' ? currentInterval.speed : currentInterval.type) : '';
    const targetPhaseType = targetInterval.type === 'walking' ? targetInterval.speed : targetInterval.type;

    if (currentPhaseType !== targetPhaseType && userProfile.showVideoPreview !== false) {
      const phase = getPhaseVideo(targetInterval.type, targetInterval.speed);
      setPhasePreviewVideo(phase.video);
      setPhasePreviewTitle(phase.title);
      setPhasePreviewSub(phase.sub);
      setShowPhasePreview(true);
      setTimeout(() => setShowPhasePreview(false), 3000);
    }

    // Annuncia la fase di destinazione (stesso comportamento di skipToNext)
    setTimeout(() => {
      if (targetInterval.type === 'warmup') {
        playPhaseAnnouncement('warmup_announce', targetInterval.duration);
        vibrate('light');
      } else if (targetInterval.speed === 'fast') {
        playPhaseAnnouncement('fast_announce', targetInterval.duration);
        vibrate('heavy');
      } else if (targetInterval.speed === 'moderate') {
        playPhaseAnnouncement('moderate_announce', targetInterval.duration);
        vibrate('medium');
      } else if (targetInterval.type === 'cooldown') {
        playPhaseAnnouncement('cooldown_announce', targetInterval.duration);
        vibrate('light');
      } else {
        // Nessun MP3 per questo caso: resetta il flag manualmente
        isPlayingPhaseAnnouncementRef.current = false;
        vibrate('medium');
      }
    }, 200);
  };

  const skipToNextInterval = async () => {
    const todayProgram = weeklyProgramRef.current[currentWeek - 1];
    if (!todayProgram || sessionData.currentIntervalIndex >= todayProgram.intervals.length - 1) {
      vibrate('light');
      return;
    }

    // Calculate elapsed time at start of next interval
    let elapsedAtNextInterval = 0;
    for (let i = 0; i <= sessionData.currentIntervalIndex; i++) {
      elapsedAtNextInterval += Math.round(todayProgram.intervals[i].duration * 60);
    }

    const nextIdx = sessionData.currentIntervalIndex + 1;
    const prevInterval = todayProgram.intervals[sessionData.currentIntervalIndex];
    const nextInterval = todayProgram.intervals[nextIdx];

    // Aggiorna refs
    currentIntervalIndexRef.current = nextIdx;
    elapsedRef.current = elapsedAtNextInterval;
    // Stessi reset che fa checkIntervalChange: blocca coaching per 15s e resetta flag fase
    lastPhaseTransitionTimeRef.current = Date.now();
    phaseMessageSentRef.current = false;
    isPlayingPhaseAnnouncementRef.current = true;

    setSessionData(prev => ({
      ...prev,
      currentIntervalIndex: nextIdx,
      elapsed: elapsedAtNextInterval
    }));

    // Mostra video preview se cambia tipo di fase
    const prevPhaseType = prevInterval ? (prevInterval.type === 'walking' ? prevInterval.speed : prevInterval.type) : '';
    const nextPhaseType = nextInterval.type === 'walking' ? nextInterval.speed : nextInterval.type;

    if (prevPhaseType !== nextPhaseType && userProfile.showVideoPreview !== false) {
      const phase = getPhaseVideo(nextInterval.type, nextInterval.speed);
      setPhasePreviewVideo(phase.video);
      setPhasePreviewTitle(phase.title);
      setPhasePreviewSub(phase.sub);
      setShowPhasePreview(true);
      setTimeout(() => setShowPhasePreview(false), 3000);
    }

    // Annuncia il nuovo intervallo
    setTimeout(() => {
      if (nextInterval.type === 'warmup') {
        playPhaseAnnouncement('warmup_announce', nextInterval.duration);
        vibrate('light');
      } else if (nextInterval.speed === 'fast') {
        playPhaseAnnouncement('fast_announce', nextInterval.duration);
        vibrate('heavy');
      } else if (nextInterval.speed === 'moderate') {
        playPhaseAnnouncement('moderate_announce', nextInterval.duration);
        vibrate('medium');
      } else if (nextInterval.type === 'cooldown') {
        playPhaseAnnouncement('cooldown_announce', nextInterval.duration);
        vibrate('light');
      } else {
        // Nessun MP3 per questo caso: resetta il flag manualmente
        isPlayingPhaseAnnouncementRef.current = false;
        vibrate('medium');
      }
    }, 200);
  };

  const stopWorkout = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (locationSubscription.current) locationSubscription.current.remove();
    if (pedometerSubscription.current) pedometerSubscription.current.remove();
    setIsWorkoutActive(false);
    isWorkoutStartingRef.current = false; // consente nuovo avvio nella prossima sessione

    const todayProgram = weeklyProgram[currentWeek - 1];
    const calories = todayProgram ? todayProgram.estimatedCalories : Math.round((sessionData.distance / 1000) * 65);

    // COMPREHENSIVE VALIDATION
    const totalProgramDuration = todayProgram ? todayProgram.totalDuration * 60 : 0;
    const realTimeElapsed = (Date.now() - sessionData.realStartTime) / 1000; // seconds
    const distanceKm = sessionData.distance / 1000;
    const expectedMinDistance = (totalProgramDuration / 3600) * 4.5 * 0.4; // 40% of expected at 4.5km/h
    
    // Check 1: Real time must be >= 80% of program
    const timeValid = realTimeElapsed >= (totalProgramDuration * 0.8);
    
    // Check 2: Distance must be reasonable (at least 40% of expected)
    const distanceValid = distanceKm >= expectedMinDistance;
    
    // Check 3: Must have some steps
    const stepsValid = sessionData.steps >= 100;

    if (!timeValid || !distanceValid || !stepsValid) {
      const reasons = [];
      if (!timeValid) {
        const minutesNeeded = Math.ceil((totalProgramDuration * 0.8) / 60);
        const minutesDone = Math.floor(realTimeElapsed / 60);
        reasons.push(`Tempo: ${minutesDone} min di ${minutesNeeded} necessari`);
      }
      if (!distanceValid) {
        reasons.push(`Distanza: ${distanceKm.toFixed(2)} km troppo bassa`);
      }
      if (!stepsValid) {
        reasons.push(`Passi: ${sessionData.steps} (minimo 100)`);
      }

      Alert.alert(
        'Allenamento non valido',
        `Per sbloccare badge e salvare progressi:\n\n${reasons.join('\n')}\n\nCompleta almeno l'80% del programma camminando realmente.`,
        [
          {
            text: 'Continua Allenamento',
            onPress: () => {
              setSessionData(prev => ({ ...prev, isActive: true }));
              setIsWorkoutActive(true);
            },
            style: 'cancel'
          },
          {
            text: 'Termina Comunque',
            onPress: () => finishWorkoutEarly()
          }
        ]
      );
      return;
    }

    const workout: WorkoutRecord = {
      date: new Date().toISOString(),
      duration: sessionData.elapsed,
      distance: (sessionData.distance / 1000).toFixed(2),
      pace: sessionData.pace.toFixed(2),
      steps: sessionData.steps,
      cadence: sessionData.cadence,
      route: sessionData.route,
      calories: calories,
      weather: weatherRef.current || undefined
    };

    const newHistory = [workout, ...workoutHistory];
    setWorkoutHistory(newHistory);
    checkAndUnlockBadges(workout);
    syncWorkoutToHealth(workout);
    addXP('workout_complete');
    addXP('km_walked', parseFloat(workout.distance));

    // ===== TRIGGER: PERSONAL RECORDS =====
    if (workoutHistory.length > 0) {
      const prevBestDistance = Math.max(...workoutHistory.map(w => parseFloat(w.distance)));
      const prevBestSpeed = Math.max(...workoutHistory.map(w => {
        const d = parseFloat(w.distance);
        const h = w.duration / 3600;
        return h > 0 ? d / h : 0;
      }));
      const prevBestSteps = Math.max(...workoutHistory.map(w => w.steps));
      const prevBestDuration = Math.max(...workoutHistory.map(w => w.duration));

      const newDistance = parseFloat(workout.distance);
      const newSpeed = workout.duration > 0 ? newDistance / (workout.duration / 3600) : 0;

      // Controlla record (uno solo, quello più significativo)
      if (newDistance > prevBestDistance && newDistance > 0.5) {
        setTimeout(() => { speakMessage('record_distance', { name: userProfile.name }); vibrate('heavy'); }, 3500);
      } else if (newSpeed > prevBestSpeed && newSpeed > 3) {
        setTimeout(() => { speakMessage('record_speed', { name: userProfile.name }); vibrate('heavy'); }, 3500);
      } else if (workout.steps > prevBestSteps && workout.steps > 500) {
        setTimeout(() => { speakMessage('record_steps', { name: userProfile.name }); vibrate('heavy'); }, 3500);
      } else if (workout.duration > prevBestDuration && workout.duration > 600) {
        setTimeout(() => { speakMessage('record_duration', { name: userProfile.name }); vibrate('medium'); }, 3500);
      }
    }

    // Reset comeback flag per il prossimo allenamento
    combackAnnouncedRef.current = false;
    
    speakMessage('workout_complete', {
      name: userProfile.name,
      distance: workout.distance,
      duration: Math.floor(workout.duration / 60),
      steps: workout.steps,
      calories: workout.calories
    });
    
    vibrate('heavy');
    setCurrentScreen('summary');
    saveAllData();
  };

  const finishWorkoutEarly = () => {
    // End workout without saving to history or unlocking badges
    setIsWorkoutActive(false);
    speakMessage('invalid_workout', {});
    setCurrentScreen('dashboard');
  };

  const toggleMap = () => setShowMap(!showMap);

  function canProceed(): boolean {
    switch(onboardingStep) {
      case 1: return userProfile.name.length > 0;
      case 2: return Number(userProfile.age) > 0;
      case 3: return userProfile.gender !== '';
      case 4: return Number(userProfile.weight) > 0;
      case 5: return Number(userProfile.height) > 0;
      case 6: return Number(userProfile.targetWeight) > 0 && Number(userProfile.targetWeight) < Number(userProfile.weight);
      case 7: return userProfile.trainingDays.length > 0;
      case 8: return userProfile.fitnessLevel !== '';
      case 9: return userProfile.weightLossSpeed !== '';
      default: return false;
    }
  }

  // Graph data preparation
  const getWeightGraphData = () => {
    const period = graphPeriod;
    const now = new Date();
    const startDate = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);
    
    const filteredData = weightHistory
      .filter(w => new Date(w.date) >= startDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    if (filteredData.length === 0) {
      return {
        labels: ['Oggi'],
        datasets: [{ data: [userProfile.weight] }]
      };
    }
    
    return {
      labels: filteredData.map((_, i) => i === 0 ? 'Inizio' : i === filteredData.length - 1 ? 'Oggi' : ''),
      datasets: [{
        data: filteredData.map(w => w.weight),
        color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
        strokeWidth: 3
      }]
    };
  };

  const getCaloriesGraphData = () => {
    const period = graphPeriod;
    const now = new Date();
    const startDate = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);
    
    const filteredData = workoutHistory
      .filter(w => new Date(w.date) >= startDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-7);
    
    if (filteredData.length === 0) {
      return {
        labels: ['Nessun dato'],
        datasets: [{ data: [0] }]
      };
    }
    
    return {
      labels: filteredData.map(w => new Date(w.date).getDate().toString()),
      datasets: [{
        data: filteredData.map(w => w.calories)
      }]
    };
  };

  const getDistanceGraphData = () => {
    const period = graphPeriod;
    const now = new Date();
    const startDate = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);
    
    const filteredData = workoutHistory
      .filter(w => new Date(w.date) >= startDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-7);
    
    if (filteredData.length === 0) {
      return {
        labels: ['Nessun dato'],
        datasets: [{ data: [0] }]
      };
    }
    
    return {
      labels: filteredData.map(w => new Date(w.date).getDate().toString()),
      datasets: [{
        data: filteredData.map(w => parseFloat(w.distance)),
        color: (opacity = 1) => `rgba(33, 150, 243, ${opacity})`,
        strokeWidth: 2
      }]
    };
  };

  const chartConfig = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 1,
    color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    style: { borderRadius: 16 },
    propsForDots: {
      r: '5',
      strokeWidth: '2',
      stroke: '#4CAF50'
    }
  };

  // Calendar functions
  const getCalendarDays = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const isWorkoutDay = (day: number | null): boolean => {
    if (!day) return false;
    const now = new Date();
    const checkDate = new Date(now.getFullYear(), now.getMonth(), day);
    const dateStr = checkDate.toDateString();
    return workoutHistory.some(w => new Date(w.date).toDateString() === dateStr);
  };

  const isPlannedDay = (day: number | null): boolean => {
    if (!day) return false;
    const now = new Date();
    const checkDate = new Date(now.getFullYear(), now.getMonth(), day);
    return userProfile.trainingDays.includes(checkDate.getDay());
  };

  const isToday = (day: number | null): boolean => {
    if (!day) return false;
    const now = new Date();
    return day === now.getDate();
  };

  // ============= SCREENS =============

  if (currentScreen === 'welcome') {
    return (
      <View style={styles.container}>
        <View style={styles.welcomeContent}>
          <Text style={styles.appIcon}>🚶‍♀️</Text>
          <Text style={styles.appTitle}>FitWalk</Text>
          <Text style={styles.appSubtitle}>
            Il tuo programma personalizzato{'\n'}per perdere peso camminando
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setCurrentScreen('onboarding')}>
            <Text style={styles.primaryButtonText}>Inizia Ora</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Onboarding (same as v2, keeping compact)
  if (currentScreen === 'onboarding') {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView style={styles.onboardingContainer}>
            <View style={styles.onboardingHeader}>
              {onboardingStep > 1 && (
                <TouchableOpacity onPress={prevOnboardingStep}>
                  <Text style={styles.backButton}>← Indietro</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.stepIndicator}>{onboardingStep}/9</Text>
            </View>

            {onboardingStep === 1 && (
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Come ti chiami?</Text>
                <TextInput
                  style={styles.input}
                  value={userProfile.name}
                  onChangeText={(text) => setUserProfile({ ...userProfile, name: text })}
                  placeholder="Il tuo nome"
                />
                <Text style={styles.stepHint}>Ti chiameremo per nome durante gli allenamenti!</Text>
              </View>
            )}

            {onboardingStep === 2 && (
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Quanti anni hai?</Text>
                <TextInput
                  style={styles.input}
                  value={userProfile.age ? userProfile.age.toString() : ''}
                  onChangeText={(text) => setUserProfile({ ...userProfile, age: parseInt(text) || 0 })}
                  keyboardType="numeric"
                />
              </View>
            )}

            {onboardingStep === 3 && (
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Sei uomo o donna?</Text>
                <View style={styles.genderButtons}>
                  <TouchableOpacity 
                    style={[styles.genderButton, userProfile.gender === 'M' && styles.genderButtonActive]}
                    onPress={() => setUserProfile({ ...userProfile, gender: 'M' })}
                  >
                    <Text style={[styles.genderButtonText, userProfile.gender === 'M' && styles.genderButtonTextActive]}>
                      👨 Uomo
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.genderButton, userProfile.gender === 'F' && styles.genderButtonActive]}
                    onPress={() => setUserProfile({ ...userProfile, gender: 'F' })}
                  >
                    <Text style={[styles.genderButtonText, userProfile.gender === 'F' && styles.genderButtonTextActive]}>
                      👩 Donna
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {onboardingStep === 4 && (
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Quanto pesi ora?</Text>
                <View style={styles.inputWithUnit}>
                  <TextInput
                    style={[styles.input, styles.inputLarge]}
                    value={userProfile.weight ? userProfile.weight.toString() : ''}
                    onChangeText={(text) => setUserProfile({ ...userProfile, weight: parseFloat(text.replace(',', '.')) || 0 })}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.unitText}>kg</Text>
                </View>
              </View>
            )}

            {onboardingStep === 5 && (
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Quanto sei alto/a?</Text>
                <View style={styles.inputWithUnit}>
                  <TextInput
                    style={[styles.input, styles.inputLarge]}
                    value={userProfile.height ? userProfile.height.toString() : ''}
                    onChangeText={(text) => setUserProfile({ ...userProfile, height: parseInt(text) || 0 })}
                    keyboardType="numeric"
                  />
                  <Text style={styles.unitText}>cm</Text>
                </View>
              </View>
            )}

            {onboardingStep === 6 && (
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Peso obiettivo?</Text>
                <View style={styles.inputWithUnit}>
                  <TextInput
                    style={[styles.input, styles.inputLarge]}
                    value={userProfile.targetWeight ? userProfile.targetWeight.toString() : ''}
                    onChangeText={(text) => setUserProfile({ ...userProfile, targetWeight: parseFloat(text.replace(',', '.')) || 0 })}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.unitText}>kg</Text>
                </View>
              </View>
            )}

            {onboardingStep === 7 && (
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Giorni di allenamento?</Text>
                <View style={styles.daysGrid}>
                  {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((day, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[styles.dayButton, userProfile.trainingDays.includes(index) && styles.dayButtonActive]}
                      onPress={() => toggleTrainingDay(index)}
                    >
                      <Text style={[styles.dayButtonText, userProfile.trainingDays.includes(index) && styles.dayButtonTextActive]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {onboardingStep === 8 && (
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Livello fitness?</Text>
                <TouchableOpacity 
                  style={[styles.levelButton, userProfile.fitnessLevel === 'beginner' && styles.levelButtonActive]}
                  onPress={() => setUserProfile({ ...userProfile, fitnessLevel: 'beginner' })}
                >
                  <Text style={styles.levelButtonTitle}>🌱 Principiante</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.levelButton, userProfile.fitnessLevel === 'intermediate' && styles.levelButtonActive]}
                  onPress={() => setUserProfile({ ...userProfile, fitnessLevel: 'intermediate' })}
                >
                  <Text style={styles.levelButtonTitle}>💪 Intermedio</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.levelButton, userProfile.fitnessLevel === 'advanced' && styles.levelButtonActive]}
                  onPress={() => setUserProfile({ ...userProfile, fitnessLevel: 'advanced' })}
                >
                  <Text style={styles.levelButtonTitle}>🏃 Avanzato</Text>
                </TouchableOpacity>
              </View>
            )}

            {onboardingStep === 9 && (
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Ritmo perdita peso?</Text>
                <TouchableOpacity 
                  style={[styles.levelButton, userProfile.weightLossSpeed === 'moderate' && styles.levelButtonActive]}
                  onPress={() => setUserProfile({ ...userProfile, weightLossSpeed: 'moderate' })}
                >
                  <Text style={styles.levelButtonTitle}>🐢 Moderato (0.5 kg/sett)</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.levelButton, userProfile.weightLossSpeed === 'standard' && styles.levelButtonActive]}
                  onPress={() => setUserProfile({ ...userProfile, weightLossSpeed: 'standard' })}
                >
                  <Text style={styles.levelButtonTitle}>🚀 Standard (1 kg/sett)</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity 
              style={[styles.primaryButton, styles.continueButton, !canProceed() && styles.primaryButtonDisabled]}
              onPress={nextOnboardingStep}
              disabled={!canProceed()}
            >
              <Text style={styles.primaryButtonText}>{onboardingStep === 9 ? 'Inizia!' : 'Continua'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    );
  }

  // Dashboard with navigation
  if (currentScreen === 'dashboard') {
    const todayProgram = weeklyProgram[currentWeek - 1];
    const dietCoverage = todayProgram ? 100 - todayProgram.coveragePercent : 60;
    const currentStreak = calculateStreak(workoutHistory);
    const unlockedBadgesCount = badges.filter(b => b.unlocked).length;

    return (
      <View style={styles.dashboardMain}>
        <ScrollView style={styles.dashboardContainer}>
          <LinearGradient colors={[Colors.gradientStart, Colors.gradientEnd]} style={styles.dashboardHeader}>
            <Text style={styles.dashboardTitle}>FitWalk</Text>
            <View style={styles.headerIcons}>
              <MaterialIcons name="person-outline" size={32} color={Colors.textPrimary} />
              <TouchableOpacity onPress={() => setCurrentScreen('settings')}><MaterialIcons name="settings" size={24} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
          </LinearGradient>

          <Text style={styles.welcomeText}>Ciao {userProfile.name}!</Text>
          <Text style={styles.goalText}>Obiettivo: -{(userProfile.weight - userProfile.targetWeight).toFixed(1)} kg</Text>

          {/* Quick Stats Row - Circular */}
          <View style={styles.quickStatsRow}>
            <View style={styles.quickStatCard}>
              <View style={styles.circleMetric}>
                <MaterialIcons name="local-fire-department" size={24} color={Colors.orangeAccent} />
              </View>
              <Text style={styles.quickStatValue}>{currentStreak}</Text>
              <Text style={styles.quickStatLabel}>Streak</Text>
            </View>
            <View style={styles.quickStatCard}>
              <View style={[styles.circleMetric, { borderColor: Colors.healthGreen }]}>
                <MaterialIcons name="badge" size={24} color={Colors.healthGreen} />
              </View>
              <Text style={styles.quickStatValue}>{unlockedBadgesCount}/19</Text>
              <Text style={styles.quickStatLabel}>Badge</Text>
            </View>
            <View style={styles.quickStatCard}>
              <View style={[styles.circleMetric, { borderColor: Colors.accentBlue }]}>
                <MaterialIcons name="fitness-center" size={24} color={Colors.accentBlue} />
              </View>
              <Text style={styles.quickStatValue}>{workoutHistory.length}</Text>
              <Text style={styles.quickStatLabel}>Allenamenti</Text>
            </View>
          </View>

          {/* XP Level Bar */}
          <View style={{ marginHorizontal: 20, marginBottom: 12, backgroundColor: Colors.cardBg, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(59,130,246,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: Colors.accentBlue }}>{userLevel.level}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: Colors.textPrimary, fontSize: 13, fontWeight: '600' }}>{userLevel.title}</Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 11 }}>{userLevel.xp} XP</Text>
              </View>
              <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3 }}>
                <View style={{ width: `${getXPProgress()}%` as any, height: 6, backgroundColor: Colors.accentBlue, borderRadius: 3 }} />
              </View>
              <Text style={{ color: Colors.textSecondary, fontSize: 10, marginTop: 2 }}>{getXPForNextLevel()} XP al prossimo livello</Text>
            </View>
          </View>

          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>Settimana {currentWeek} di {weeksToGoal}</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressBarFill, { width: `${(currentWeek / weeksToGoal) * 100}%` }]} />
            </View>
            <Text style={styles.progressPercent}>{Math.round((currentWeek / weeksToGoal) * 100)}%</Text>
          </View>

          {/* Piano attivo + selector */}
          <View style={{ marginHorizontal: 20, marginBottom: 12 }}>
            <Text style={{ color: Colors.textSecondary, fontSize: 12, marginBottom: 8 }}>PIANO ATTIVO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
              {TRAINING_PLANS.map(plan => (
                <TouchableOpacity
                  key={plan.id}
                  onPress={() => { 
                    setActivePlan(plan.id);
                    // saveAllData sarà chiamato dal useEffect dopo il re-render
                    setTimeout(() => saveAllData(), 100);
                  }}
                  style={{ backgroundColor: activePlan === plan.id ? `${plan.color}22` : Colors.cardBg, borderRadius: 12, padding: 10, marginHorizontal: 4, borderWidth: activePlan === plan.id ? 1 : 0, borderColor: plan.color, minWidth: 110, alignItems: 'center' }}
                >
                  <MaterialIcons name={plan.icon as any} size={22} color={activePlan === plan.id ? plan.color : Colors.textSecondary} />
                  <Text style={{ color: activePlan === plan.id ? plan.color : Colors.textSecondary, fontSize: 11, fontWeight: '600', marginTop: 4, textAlign: 'center' }}>{plan.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Camminate guidate */}
          <TouchableOpacity 
            onPress={() => setShowGuidedWalks(!showGuidedWalks)}
            style={{ marginHorizontal: 20, marginBottom: 8, backgroundColor: Colors.cardBg, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <MaterialIcons name="headphones" size={22} color="#8B5CF6" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: Colors.textPrimary, fontSize: 14, fontWeight: '600' }}>Camminate Guidate</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 11 }}>Sessioni tematiche con coaching vocale</Text>
            </View>
            <MaterialIcons name={showGuidedWalks ? 'expand-less' : 'expand-more'} size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
          {showGuidedWalks && (
            <View style={{ marginHorizontal: 20, marginBottom: 12, gap: 8 }}>
              {GUIDED_WALKS.map(walk => (
                <TouchableOpacity 
                  key={walk.id}
                  onPress={() => {
                    Alert.alert(walk.title, `${walk.subtitle}\n\nDurata: ${walk.duration} minuti\n\nVuoi iniziare?`, [
                      { text: 'Annulla', style: 'cancel' },
                      { text: 'Inizia', onPress: () => {
                        setActiveGuidedWalk(walk);
                        // Avvia come allenamento libero con timer guidato
                        setSessionData({ phase: 'warmup', elapsed: 0, distance: 0, pace: 0, isActive: true, lastPosition: null, currentSpeed: 0, currentIntervalIndex: 0, steps: 0, cadence: 0, route: [], lastKmAnnounced: 0, realStartTime: Date.now() });
                        setIsWorkoutActive(true);
                        setCurrentScreen('workout');
                        if (!indoorMode) { startGPSTracking(); }
                        startPedometerTracking();
                        // Primo messaggio: guided walk usa testo personalizzato, nessun MP3 dedicato
                        // (Speech rimosso - Step 1+5)
                      }}
                    ]);
                  }}
                  style={{ backgroundColor: `${walk.color}15`, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderLeftWidth: 3, borderLeftColor: walk.color }}
                >
                  <MaterialIcons name={walk.icon as any} size={24} color={walk.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Colors.textPrimary, fontSize: 14, fontWeight: '600' }}>{walk.title}</Text>
                    <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>{walk.subtitle}</Text>
                  </View>
                  <Text style={{ color: walk.color, fontSize: 14, fontWeight: '700' }}>{walk.duration}'</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {todayProgram && (
            <View style={styles.nextSessionCard}>
              <Text style={styles.nextSessionTitle}>Prossima Sessione</Text>
              <View style={styles.sessionInfo}>
                <Text style={{ fontSize: 64, fontWeight: "900", color: Colors.accentBlue }}>{todayProgram.totalDuration}</Text>
                <Text style={{ fontSize: 20, fontWeight: '600', color: Colors.textSecondary, marginLeft: 4, marginBottom: 10 }}>min</Text>
                <View style={{ flex: 1 }} />
                <Text style={{ fontSize: 28, fontWeight: '700', color: Colors.textSecondary }}>{todayProgram.estimatedCalories}</Text>
                <Text style={{ fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginLeft: 4, marginBottom: 4 }}>kcal</Text>
              </View>
              {/* Dettaglio intervalli */}
              <View style={{ marginTop: 10, marginBottom: 10 }}>
                {todayProgram.intervals.filter(interval => interval.duration > 0).map((interval, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: interval.color, marginRight: 8 }} />
                    <Text style={{ color: Colors.textSecondary, fontSize: 13, flex: 1 }}>
                      {interval.name}
                    </Text>
                    <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>
                      {interval.duration >= 1 ? `${Math.round(interval.duration)} min` : `${Math.round(interval.duration * 60)} sec`}
                    </Text>
                  </View>
                ))}
              </View>
              {/* Schema riassuntivo */}
              {(() => {
                const activeProgressionTable = getActiveProgression();
                const maxWeek = Math.max(...Object.keys(activeProgressionTable).map(Number));
                const prog = activeProgressionTable[Math.min(currentWeek, maxWeek)];
                const level = userProfile.fitnessLevel || 'beginner';
                const speeds = SPEED_BY_LEVEL[level] || SPEED_BY_LEVEL.beginner;
                // Controlla se il piano ha veloce in almeno una settimana
                const planHasFast = Object.values(activeProgressionTable).some((w: any) => w.fastMin > 0);
                return (
                  <View style={{ backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                    <Text style={{ color: Colors.textPrimary, fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>
                      {planHasFast 
                        ? `Schema: ${prog.fastMin}' veloce / ${prog.modMin}' sostenuta × ${prog.reps} ripetizioni`
                        : `Schema: ${prog.modMin} minuti di camminata continua`}
                    </Text>
                    <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>
                      {planHasFast 
                        ? `Velocità: ${speeds.moderate} km/h → ${speeds.fast} km/h`
                        : `Velocità: ${speeds.moderate} km/h — ritmo rilassante e costante`}
                    </Text>
                  </View>
                );
              })()}

              {/* Indoor/Outdoor Toggle */}
              <TouchableOpacity 
                onPress={() => setIndoorMode(!indoorMode)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12, paddingVertical: 10, backgroundColor: indoorMode ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.05)', borderRadius: 10 }}
              >
                <MaterialIcons name={indoorMode ? 'fitness-center' : 'park'} size={20} color={indoorMode ? Colors.orangeAccent : Colors.healthGreen} />
                <Text style={{ color: indoorMode ? Colors.orangeAccent : Colors.healthGreen, fontSize: 14, fontWeight: '600' }}>
                  {indoorMode ? 'Indoor / Treadmill' : 'All\'aperto'}
                </Text>
                <View style={{ width: 40, height: 22, borderRadius: 11, backgroundColor: indoorMode ? Colors.orangeAccent : 'rgba(255,255,255,0.2)', justifyContent: 'center', paddingHorizontal: 2 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: 'white', alignSelf: indoorMode ? 'flex-end' : 'flex-start' }} />
                </View>
              </TouchableOpacity>
              {indoorMode && (
                <Text style={{ color: Colors.textSecondary, fontSize: 11, textAlign: 'center', marginBottom: 10 }}>
                  Distanza stimata dai passi (no GPS). Ideale per tapis roulant o casa.
                </Text>
              )}

              <TouchableOpacity onPress={() => {
                if (isWorkoutStartingRef.current) return; // blocca press multipli
                isWorkoutStartingRef.current = true;
                if (userProfile.showVideoPreview === false) {
                  startWorkout();
                } else {
                  const phase = getPhaseVideo('warmup');
                  setPhasePreviewVideo(phase.video);
                  setPhasePreviewTitle(phase.title);
                  setPhasePreviewSub(phase.sub);
                  videoAutoStartedRef.current = false;
                  setShowPhasePreview(true);
                  // Fallback: se didJustFinish non scatta (bug iOS), avvia dopo 10 secondi
                  setTimeout(() => {
                    if (!videoAutoStartedRef.current) {
                      videoAutoStartedRef.current = true;
                      setShowPhasePreview(false);
                      startWorkout();
                    }
                  }, 10000);
                }
              }}>
                <LinearGradient colors={[Colors.healthGreen, Colors.successGreen]} style={styles.startButton}>
                  <Text style={styles.startButtonText}>INIZIA ALLENAMENTO</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.coverageCard}>
            <Text style={styles.coverageTitle}>Deficit calorico</Text>
            <Text style={{ color: Colors.textSecondary, fontSize: 12, marginBottom: 10 }}>Come raggiungi il tuo obiettivo: camminata + alimentazione</Text>
            <View style={styles.coverageRow}>
              <View style={styles.coverageItem}>
                <View style={[styles.circleDeficit, { borderColor: Colors.healthGreen }]}>
                  <Text style={styles.circleDeficitText}>{todayProgram?.coveragePercent || 0}%</Text>
                </View>
                <MaterialIcons name="directions-walk" size={24} color={Colors.healthGreen} style={{ marginTop: 8 }} />
                <Text style={styles.coverageLabel}>Camminata</Text>
              </View>
              <View style={styles.coverageItem}>
                <View style={[styles.circleDeficit, { borderColor: Colors.redSoft }]}>
                  <Text style={styles.circleDeficitText}>{dietCoverage}%</Text>
                </View>
                <MaterialIcons name="restaurant-menu" size={24} color={Colors.redSoft} style={{ marginTop: 8 }} />
                <Text style={styles.coverageLabel}>Dieta</Text>
              </View>
            </View>
          </View>

          {/* v5.0: WATER TRACKER */}
          <View style={styles.coverageCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="water-drop" size={22} color="#60A5FA" />
                <Text style={styles.coverageTitle}>Idratazione</Text>
              </View>
              <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>{waterToday}/{waterGoal} bicchieri</Text>
            </View>
            <Text style={{ color: Colors.textSecondary, fontSize: 12, marginBottom: 8 }}>Quanti bicchieri d'acqua hai bevuto oggi</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
              <TouchableOpacity onPress={removeWaterGlass} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="remove" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: '#60A5FA', fontSize: 36, fontWeight: '900' }}>{waterToday}</Text>
                <View style={{ width: 120, height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, marginTop: 4 }}>
                  <View style={{ width: `${Math.min((waterToday / waterGoal) * 100, 100)}%` as any, height: 6, backgroundColor: '#60A5FA', borderRadius: 3 }} />
                </View>
              </View>
              <TouchableOpacity onPress={addWaterGlass} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(96,165,250,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="add" size={24} color="#60A5FA" />
              </TouchableOpacity>
            </View>
          </View>

          {/* v5.0: TIP GIORNALIERO NUTRIZIONE */}
          {showNutritionTips && (() => {

          {/* v5.0: OBIETTIVI MENSILI */}
          {monthlyGoals.length > 0 && (
            <View style={styles.coverageCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <MaterialIcons name="flag" size={22} color={Colors.orangeAccent} />
                <Text style={styles.coverageTitle}>Obiettivi del mese</Text>
              </View>
              {monthlyGoals.map(goal => {
                const percent = Math.min(100, Math.round((goal.current / goal.target) * 100));
                const isComplete = percent >= 100;
                return (
                  <View key={goal.id} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <MaterialIcons name={goal.icon as any} size={16} color={isComplete ? Colors.healthGreen : Colors.textSecondary} />
                        <Text style={{ color: Colors.textPrimary, fontSize: 13 }}>{goal.title}</Text>
                      </View>
                      <Text style={{ color: isComplete ? Colors.healthGreen : Colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                        {isComplete ? '✓' : `${goal.current}/${goal.target}`}
                      </Text>
                    </View>
                    <View style={{ height: 5, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3 }}>
                      <View style={{ width: `${percent}%` as any, height: 5, backgroundColor: isComplete ? Colors.healthGreen : Colors.orangeAccent, borderRadius: 3 }} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* v5.0: PERCORSI SALVATI (se presenti) */}
          {savedRoutes.length > 0 && (
            <View style={styles.coverageCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <MaterialIcons name="route" size={22} color={Colors.accentBlue} />
                <Text style={styles.coverageTitle}>Percorsi salvati</Text>
              </View>
              {savedRoutes.slice(0, 3).map(route => (
                <TouchableOpacity key={route.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', gap: 10 }}>
                  <MaterialIcons name="map" size={18} color={Colors.accentBlue} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Colors.textPrimary, fontSize: 13, fontWeight: '600' }}>{route.name}</Text>
                    <Text style={{ color: Colors.textSecondary, fontSize: 11 }}>{route.distance} km</Text>
                  </View>
                  <TouchableOpacity onPress={() => deleteRoute(route.id)}>
                    <MaterialIcons name="close" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          )}
            const tip = getDailyTip();
            return (
              <View style={[styles.coverageCard, { borderLeftWidth: 3, borderLeftColor: Colors.healthGreen }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <MaterialIcons name={tip.icon as any} size={22} color={Colors.healthGreen} />
                  <Text style={{ color: Colors.healthGreen, fontSize: 14, fontWeight: '700' }}>Dieta Mediterranea</Text>
                </View>
                <Text style={{ color: Colors.textPrimary, fontSize: 15, fontWeight: '600', marginBottom: 4 }}>{tip.title}</Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 13, lineHeight: 19 }}>{tip.text}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 8, fontStyle: 'italic' }}>
                  Informazione a scopo educativo. Non sostituisce il parere di un medico o nutrizionista.
                </Text>
              </View>
            );
          })()}

          <View style={{ height: 20 }} />
        </ScrollView>

        {/* v5.0: PESO POPUP SETTIMANALE */}
        <Modal visible={showWeightPopup} animationType="fade" transparent={true}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 30 }}>
            <View style={{ backgroundColor: Colors.primaryDark, borderRadius: 24, padding: 30, width: '100%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
              <MaterialIcons name="monitor-weight" size={40} color={Colors.accentBlue} style={{ alignSelf: 'center', marginBottom: 16 }} />
              <Text style={{ color: Colors.textPrimary, fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>Aggiornamento peso</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 20 }}>È passata una settimana! Quanto pesi oggi?</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
                <TextInput
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: Colors.textPrimary, fontSize: 28, fontWeight: '700', textAlign: 'center', width: 120, height: 56, borderRadius: 12 }}
                  value={weightInputValue}
                  onChangeText={setWeightInputValue}
                  keyboardType="decimal-pad"
                  placeholder={userProfile.weight?.toString()}
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />
                <Text style={{ color: Colors.textSecondary, fontSize: 18 }}>kg</Text>
              </View>
              {weightHistory.length >= 2 && (
                <Text style={{ color: Colors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 16 }}>
                  Ultimo peso: {weightHistory[weightHistory.length - 1].weight} kg
                </Text>
              )}
              <TouchableOpacity onPress={submitWeightUpdate}>
                <LinearGradient colors={[Colors.healthGreen, Colors.successGreen]} style={{ paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}>
                  <Text style={{ color: Colors.textPrimary, fontSize: 16, fontWeight: '700' }}>Aggiorna</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowWeightPopup(false); AsyncStorage.setItem('fitWalkLastWeightDate', new Date().toISOString()); }} style={{ marginTop: 12, alignItems: 'center' }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 14 }}>Non ora</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Bottom Navigation */}
        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('dashboard')}>
            <MaterialIcons name="home" size={24} color={Colors.accentBlue} />
            <Text style={styles.navLabelActive}>Home</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('statistics')}>
            <MaterialIcons name="bar-chart" size={24} color={Colors.gray700} style={{opacity:0.4}} />
            <Text style={styles.navLabel}>Stats</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('achievements')}>
            <MaterialIcons name="emoji-events" size={24} color={Colors.gray700} style={{opacity:0.4}} />
            <Text style={styles.navLabel}>Trofei</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('calendar')}>
            <MaterialIcons name="calendar-today" size={24} color={Colors.gray700} style={{opacity:0.4}} />
            <Text style={styles.navLabel}>Cal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('settings')}>
            <MaterialIcons name="settings" size={24} color={Colors.gray700} style={{opacity:0.4}} />
            <Text style={styles.navLabel}>Opzioni</Text>
          </TouchableOpacity>
        </View>
        {/* Video Preview Modal */}
        <Modal visible={showPhasePreview} animationType="fade" transparent={false}>
          <View style={styles.previewModal}>
            {phasePreviewVideo && showPhasePreview && (
              <Video
                key={'pre-' + phasePreviewTitle}
                source={phasePreviewVideo}
                style={styles.previewVideo}
                resizeMode={ResizeMode.COVER}
                shouldPlay={true}
                isLooping={false}
                isMuted={true}
                onPlaybackStatusUpdate={(status: any) => {
                  if (!status.isLoaded) return;
                  if (videoAutoStartedRef.current) return;
                  if (status.positionMillis >= 8000 || status.didJustFinish) {
                    videoAutoStartedRef.current = true;
                    setShowPhasePreview(false);
                    startWorkout();
                  }
                }}
              />
            )}
            <View style={styles.previewOverlay}>
              <Text style={styles.previewTitle}>{phasePreviewTitle}</Text>
              <Text style={styles.previewSub}>{phasePreviewSub}</Text>
              <TouchableOpacity
                style={styles.previewStartBtn}
                onPress={() => {
                  videoAutoStartedRef.current = true;
                  setShowPhasePreview(false);
                  startWorkout();
                }}
              >
                <LinearGradient colors={[Colors.healthGreen, Colors.successGreen]} style={styles.previewStartGradient}>
                  <MaterialIcons name="play-arrow" size={28} color={Colors.textPrimary} />
                  <Text style={styles.previewStartText}>Visto! Iniziamo</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.previewSkipBtn}
                onPress={() => {
                  videoAutoStartedRef.current = true;
                  setShowPhasePreview(false);
                  startWorkout();
                }}
              >
                <Text style={styles.previewSkipText}>Salta video</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // Statistics Screen
  if (currentScreen === 'statistics') {
    const screenWidth = Dimensions.get('window').width;

    // Weight trend calculations
    const sortedWeights = [...weightHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const firstWeight = sortedWeights.length > 0 ? sortedWeights[0].weight : userProfile.weight;
    const currentWeight = sortedWeights.length > 0 ? sortedWeights[sortedWeights.length - 1].weight : userProfile.weight;
    const totalChange = currentWeight - firstWeight;
    const toGoal = currentWeight - userProfile.targetWeight;
    const bmi = userProfile.height > 0 ? (currentWeight / ((userProfile.height / 100) ** 2)) : 0;
    
    // Weekly change (last 7 days)
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weightsLastWeek = sortedWeights.filter(w => new Date(w.date) >= oneWeekAgo);
    const weeklyChange = weightsLastWeek.length >= 2 
      ? weightsLastWeek[weightsLastWeek.length - 1].weight - weightsLastWeek[0].weight 
      : 0;

    // Estimated goal date
    const avgWeeklyLoss = sortedWeights.length >= 2 
      ? (firstWeight - currentWeight) / Math.max(1, (new Date(sortedWeights[sortedWeights.length - 1].date).getTime() - new Date(sortedWeights[0].date).getTime()) / (7 * 24 * 60 * 60 * 1000))
      : 0;
    const weeksRemaining = avgWeeklyLoss > 0 ? Math.ceil(toGoal / avgWeeklyLoss) : 0;
    const estimatedDate = weeksRemaining > 0 ? new Date(Date.now() + weeksRemaining * 7 * 24 * 60 * 60 * 1000) : null;

    // Progress percentage
    const totalToLose = firstWeight - userProfile.targetWeight;
    const progressPercent = totalToLose > 0 ? Math.min(100, Math.round(((firstWeight - currentWeight) / totalToLose) * 100)) : 0;

    return (
      <View style={styles.dashboardMain}>
        <ScrollView style={styles.dashboardContainer}>
          <View style={styles.screenHeader}>
            <TouchableOpacity onPress={() => setCurrentScreen('dashboard')}>
              <Text style={styles.backButton}>← Indietro</Text>
            </TouchableOpacity>
            <Text style={styles.screenTitle}>Statistiche</Text>
            <View style={{ width: 80 }} />
          </View>

          {/* Period Selector */}
          <View style={styles.periodSelector}>
            <TouchableOpacity 
              style={[styles.periodButton, graphPeriod === 7 && styles.periodButtonActive]}
              onPress={() => setGraphPeriod(7)}
            >
              <Text style={[styles.periodButtonText, graphPeriod === 7 && styles.periodButtonTextActive]}>7 giorni</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.periodButton, graphPeriod === 30 && styles.periodButtonActive]}
              onPress={() => setGraphPeriod(30)}
            >
              <Text style={[styles.periodButtonText, graphPeriod === 30 && styles.periodButtonTextActive]}>30 giorni</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.periodButton, graphPeriod === 90 && styles.periodButtonActive]}
              onPress={() => setGraphPeriod(90)}
            >
              <Text style={[styles.periodButtonText, graphPeriod === 90 && styles.periodButtonTextActive]}>90 giorni</Text>
            </TouchableOpacity>
          </View>

          {/* WEIGHT TREND PANEL */}
          <View style={[styles.chartCard, { borderLeftWidth: 3, borderLeftColor: Colors.healthGreen }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <MaterialIcons name="monitor-weight" size={22} color={Colors.healthGreen} />
              <Text style={styles.chartTitle}>Trend Peso</Text>
            </View>

            {/* Current weight + progress bar */}
            <View style={{ alignItems: 'center', marginVertical: 16 }}>
              <Text style={{ color: Colors.textPrimary, fontSize: 48, fontWeight: '900' }}>{currentWeight}</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 14 }}>kg attuali</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, width: '100%' }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 11 }}>{firstWeight} kg</Text>
                <View style={{ flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>
                  <View style={{ width: `${progressPercent}%` as any, height: 8, backgroundColor: Colors.healthGreen, borderRadius: 4 }} />
                </View>
                <Text style={{ color: Colors.healthGreen, fontSize: 11, fontWeight: '600' }}>{userProfile.targetWeight} kg</Text>
              </View>
              <Text style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 6 }}>{progressPercent}% del percorso completato</Text>
            </View>

            {/* Stats grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              <View style={{ flex: 1, minWidth: '45%', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 11 }}>Variazione totale</Text>
                <Text style={{ color: totalChange <= 0 ? Colors.healthGreen : Colors.redSoft, fontSize: 20, fontWeight: '700' }}>
                  {totalChange > 0 ? '+' : ''}{totalChange.toFixed(1)} kg
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: '45%', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 11 }}>Questa settimana</Text>
                <Text style={{ color: weeklyChange <= 0 ? Colors.healthGreen : Colors.redSoft, fontSize: 20, fontWeight: '700' }}>
                  {weeklyChange > 0 ? '+' : ''}{weeklyChange.toFixed(1)} kg
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: '45%', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 11 }}>Mancano all'obiettivo</Text>
                <Text style={{ color: Colors.orangeAccent, fontSize: 20, fontWeight: '700' }}>{toGoal.toFixed(1)} kg</Text>
              </View>
              <View style={{ flex: 1, minWidth: '45%', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 11 }}>BMI attuale</Text>
                <Text style={{ color: Colors.textPrimary, fontSize: 20, fontWeight: '700' }}>{bmi.toFixed(1)}</Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 10 }}>
                  {bmi < 18.5 ? 'Sottopeso' : bmi < 25 ? 'Normopeso' : bmi < 30 ? 'Sovrappeso' : 'Obesità'}
                </Text>
              </View>
            </View>

            {/* Estimated arrival */}
            {estimatedDate && avgWeeklyLoss > 0 && (
              <View style={{ backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>
                  Al ritmo attuale ({avgWeeklyLoss.toFixed(1)} kg/settimana), raggiungerai {userProfile.targetWeight} kg verso:
                </Text>
                <Text style={{ color: Colors.healthGreen, fontSize: 16, fontWeight: '700', marginTop: 4 }}>
                  {estimatedDate.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                </Text>
              </View>
            )}

            {/* Weight Chart */}
            <LineChart
              data={{
                ...getWeightGraphData(),
                datasets: [
                  ...(getWeightGraphData().datasets),
                  { data: Array(Math.max(getWeightGraphData().datasets[0]?.data?.length || 1, 2)).fill(userProfile.targetWeight), color: () => 'rgba(239,68,68,0.4)', strokeWidth: 1, withDots: false } as any,
                ]
              }}
              width={screenWidth - 60}
              height={220}
              chartConfig={{
                ...chartConfig,
                backgroundColor: Colors.primaryDark,
                backgroundGradientFrom: 'rgba(255,255,255,0.05)',
                backgroundGradientTo: 'rgba(255,255,255,0.02)',
                labelColor: () => Colors.textSecondary,
                color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
                propsForDots: { r: '5', strokeWidth: '2', stroke: Colors.healthGreen },
              }}
              bezier
              style={styles.chart}
            />
            <Text style={{ color: Colors.textSecondary, fontSize: 10, textAlign: 'center', marginTop: 4 }}>
              Linea verde: il tuo peso — Linea rossa: obiettivo {userProfile.targetWeight} kg
            </Text>

            {/* Quick weight update */}
            <TouchableOpacity 
              onPress={() => { setWeightInputValue(''); setShowWeightPopup(true); }}
              style={{ backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 12, padding: 14, marginTop: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
            >
              <MaterialIcons name="add-circle-outline" size={20} color={Colors.healthGreen} />
              <Text style={{ color: Colors.healthGreen, fontSize: 14, fontWeight: '600' }}>Aggiorna peso</Text>
            </TouchableOpacity>
          </View>

          {/* Calories Chart */}
          <View style={styles.chartCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <MaterialIcons name="local-fire-department" size={22} color={Colors.orangeAccent} />
              <Text style={styles.chartTitle}>Calorie Bruciate</Text>
            </View>
            <BarChart
              data={getCaloriesGraphData()}
              width={screenWidth - 60}
              height={220}
              chartConfig={{
                ...chartConfig,
                backgroundColor: Colors.primaryDark,
                backgroundGradientFrom: 'rgba(255,255,255,0.05)',
                backgroundGradientTo: 'rgba(255,255,255,0.02)',
                labelColor: () => Colors.textSecondary,
                color: (opacity = 1) => `rgba(245, 158, 11, ${opacity})`,
              }}
              style={styles.chart}
            />
          </View>

          {/* Distance Chart */}
          <View style={styles.chartCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <MaterialIcons name="straighten" size={22} color={Colors.accentBlue} />
              <Text style={styles.chartTitle}>Distanza Percorsa (km)</Text>
            </View>
            <LineChart
              data={getDistanceGraphData()}
              width={screenWidth - 60}
              height={220}
              chartConfig={{
                ...chartConfig,
                backgroundColor: Colors.primaryDark,
                backgroundGradientFrom: 'rgba(255,255,255,0.05)',
                backgroundGradientTo: 'rgba(255,255,255,0.02)',
                labelColor: () => Colors.textSecondary,
                color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                propsForDots: { r: '5', strokeWidth: '2', stroke: Colors.accentBlue },
              }}
              style={styles.chart}
            />
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom Navigation */}
        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('dashboard')}>
            <MaterialIcons name="home" size={24} color={Colors.gray700} style={{opacity:0.4}} />
            <Text style={styles.navLabel}>Home</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('statistics')}>
            <MaterialIcons name="bar-chart" size={24} color={Colors.accentBlue} />
            <Text style={styles.navLabelActive}>Stats</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('achievements')}>
            <MaterialIcons name="emoji-events" size={24} color={Colors.gray700} style={{opacity:0.4}} />
            <Text style={styles.navLabel}>Trofei</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('calendar')}>
            <MaterialIcons name="calendar-today" size={24} color={Colors.gray700} style={{opacity:0.4}} />
            <Text style={styles.navLabel}>Cal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('settings')}>
            <MaterialIcons name="settings" size={24} color={Colors.gray700} style={{opacity:0.4}} />
            <Text style={styles.navLabel}>Opzioni</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Achievements Screen
  if (currentScreen === 'achievements') {
    return (
      <View style={styles.dashboardMain}>
        <ScrollView style={styles.dashboardContainer}>
          <View style={styles.screenHeader}>
            <TouchableOpacity onPress={() => setCurrentScreen('dashboard')}>
              <Text style={styles.backButton}>← Indietro</Text>
            </TouchableOpacity>
            <Text style={styles.screenTitle}>Trofei</Text>
            <View style={{ width: 80 }} />
          </View>

          {/* FITNESS BADGES */}
          <Text style={{fontSize: 16, fontWeight: '700', color: '#1F4E79', marginBottom: 8, marginTop: 4, paddingHorizontal: 16}}>Fitness</Text>
          <View style={styles.achievementsGrid}>
            {badges.filter(b => b.category === 'fitness').map((badge) => (
              <View key={badge.id} style={[styles.badgeCard, !badge.unlocked && styles.badgeCardLocked]}>
                <Text style={styles.badgeIcon}>{badge.icon}</Text>
                <Text style={styles.badgeTitle}>{badge.title}</Text>
                <Text style={{fontSize: 11, color: '#888', fontStyle: 'italic', textAlign: 'center', marginBottom: 4}}>{badge.tagline}</Text>
                {badge.unlocked ? (
                  <View style={styles.badgeUnlocked}>
                    <Text style={styles.badgeUnlockedText}>✓ Sbloccato</Text>
                    {badge.unlockedDate && (<Text style={styles.badgeDate}>{new Date(badge.unlockedDate).toLocaleDateString('it-IT')}</Text>)}
                  </View>
                ) : (
                  <View style={styles.badgeProgress}>
                    <View style={styles.badgeProgressBar}>
                      <View style={[styles.badgeProgressFill, { width: `${Math.min(100, (badge.progress / badge.target) * 100)}%` }]} />
                    </View>
                    <Text style={styles.badgeProgressText}>{badge.progress} / {badge.target}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* WEATHER & TIME BADGES */}
          <Text style={{fontSize: 16, fontWeight: '700', color: '#1F4E79', marginBottom: 8, marginTop: 16, paddingHorizontal: 16}}>Meteo & Orario</Text>
          <View style={styles.achievementsGrid}>
            {badges.filter(b => b.category === 'weather' || b.category === 'time').map((badge) => (
              <View key={badge.id} style={[styles.badgeCard, !badge.unlocked && styles.badgeCardLocked]}>
                <Text style={styles.badgeIcon}>{badge.icon}</Text>
                <Text style={styles.badgeTitle}>{badge.title}</Text>
                <Text style={{fontSize: 11, color: '#888', fontStyle: 'italic', textAlign: 'center', marginBottom: 4}}>{badge.tagline}</Text>
                {badge.unlocked ? (
                  <View style={styles.badgeUnlocked}>
                    <Text style={styles.badgeUnlockedText}>✓ Sbloccato</Text>
                    {badge.unlockedDate && (<Text style={styles.badgeDate}>{new Date(badge.unlockedDate).toLocaleDateString('it-IT')}</Text>)}
                  </View>
                ) : (
                  <View style={styles.badgeProgress}>
                    <View style={styles.badgeProgressBar}>
                      <View style={[styles.badgeProgressFill, { width: `${Math.min(100, (badge.progress / badge.target) * 100)}%` }]} />
                    </View>
                    <Text style={styles.badgeProgressText}>{badge.progress} / {badge.target}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Bottom Navigation */}
        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('dashboard')}>
            <MaterialIcons name="home" size={24} color={Colors.gray700} style={{opacity:0.4}} />
            <Text style={styles.navLabel}>Home</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('statistics')}>
            <MaterialIcons name="bar-chart" size={24} color={Colors.gray700} style={{opacity:0.4}} />
            <Text style={styles.navLabel}>Stats</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('achievements')}>
            <MaterialIcons name="emoji-events" size={24} color={Colors.accentBlue} />
            <Text style={styles.navLabelActive}>Trofei</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('calendar')}>
            <MaterialIcons name="calendar-today" size={24} color={Colors.gray700} style={{opacity:0.4}} />
            <Text style={styles.navLabel}>Cal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('settings')}>
            <MaterialIcons name="settings" size={24} color={Colors.gray700} style={{opacity:0.4}} />
            <Text style={styles.navLabel}>Opzioni</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Calendar Screen
  if (currentScreen === 'calendar') {
    const calendarDays = getCalendarDays();
    const currentStreak = calculateStreak(workoutHistory);
    const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 
                        'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    const currentMonth = monthNames[new Date().getMonth()];
    
    return (
      <View style={styles.dashboardMain}>
        <ScrollView style={styles.dashboardContainer}>
          <View style={styles.screenHeader}>
            <TouchableOpacity onPress={() => setCurrentScreen('dashboard')}>
              <Text style={styles.backButton}>← Indietro</Text>
            </TouchableOpacity>
            <Text style={styles.screenTitle}>Calendario</Text>
            <View style={{ width: 80 }} />
          </View>

          <View style={styles.calendarStats}>
            <View style={styles.calendarStatItem}>
              <Text style={styles.calendarStatValue}>{currentStreak}</Text>
              <Text style={styles.calendarStatLabel}>Streak Giorni</Text>
            </View>
            <View style={styles.calendarStatItem}>
              <Text style={styles.calendarStatValue}>{workoutHistory.length}</Text>
              <Text style={styles.calendarStatLabel}>Totale Allenamenti</Text>
            </View>
          </View>

          <View style={styles.calendarCard}>
            <Text style={styles.calendarMonth}>{currentMonth} {new Date().getFullYear()}</Text>
            
            <View style={styles.calendarWeekDays}>
              {['D', 'L', 'M', 'M', 'G', 'V', 'S'].map((day, i) => (
                <Text key={i} style={styles.calendarWeekDay}>{day}</Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarDays.map((day, index) => {
                const hasWorkout = isWorkoutDay(day);
                const isPlanned = isPlannedDay(day);
                const today = isToday(day);

                return (
                  <View key={index} style={styles.calendarDayContainer}>
                    {day ? (
                      <View style={[
                        styles.calendarDay,
                        hasWorkout && styles.calendarDayWorkout,
                        today && styles.calendarDayToday,
                        isPlanned && !hasWorkout && styles.calendarDayPlanned
                      ]}>
                        <Text style={[
                          styles.calendarDayText,
                          hasWorkout && styles.calendarDayTextWorkout,
                          today && styles.calendarDayTextToday
                        ]}>
                          {day}
                        </Text>
                        {hasWorkout && <Text style={styles.calendarDot}>●</Text>}
                      </View>
                    ) : (
                      <View style={styles.calendarDayEmpty} />
                    )}
                  </View>
                );
              })}
            </View>

            <View style={styles.calendarLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
                <Text style={styles.legendText}>Completato</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#FFC107' }]} />
                <Text style={styles.legendText}>Pianificato</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#2196F3' }]} />
                <Text style={styles.legendText}>Oggi</Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Bottom Navigation */}
        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('dashboard')}>
            <MaterialIcons name="home" size={24} color={Colors.gray700} style={{opacity:0.4}} />
            <Text style={styles.navLabel}>Home</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('statistics')}>
            <MaterialIcons name="bar-chart" size={24} color={Colors.gray700} style={{opacity:0.4}} />
            <Text style={styles.navLabel}>Statistiche</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('achievements')}>
            <MaterialIcons name="emoji-events" size={24} color={Colors.gray700} style={{opacity:0.4}} />
            <Text style={styles.navLabel}>Trofei</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('calendar')}>
            <MaterialIcons name="calendar-today" size={24} color={Colors.accentBlue} />
            <Text style={styles.navLabelActive}>Calendario</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('settings')}>
            <MaterialIcons name="settings" size={24} color={Colors.gray700} style={{opacity:0.4}} />
            <Text style={styles.navLabel}>Opzioni</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Settings Screen
  if (currentScreen === 'settings') {
    return (
      <View style={styles.dashboardMain}>
        <ScrollView style={styles.dashboardContainer}>
          <View style={styles.screenHeader}>
            <TouchableOpacity onPress={() => setCurrentScreen(isWorkoutActive ? 'workout' : 'dashboard')}>
              <Text style={styles.backButton}>← Indietro</Text>
            </TouchableOpacity>
            <Text style={styles.screenTitle}>Impostazioni</Text>
            <View style={{ width: 80 }} />
          </View>

          {/* Profile Section */}
          <View style={styles.settingsSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialIcons name="person" size={18} color={Colors.textSecondary} />
              <Text style={styles.settingsSectionTitle}>PROFILO</Text>
            </View>
            
            <TouchableOpacity 
              style={styles.settingsItem}
              onPress={() => {
                Alert.prompt(
                  'Modifica Nome',
                  'Inserisci il tuo nome',
                  (text) => {
                    if (text && text.trim()) {
                      const updated = { ...userProfile, name: text.trim() };
                      setUserProfile(updated);
                      saveAllData({ profile: updated });
                      // Rigenera i file MP3 del nome per entrambe le voci (background)
                      generateNameAudio(text.trim()).then(ok => {
                        console.log('[FW Name] settings regeneration:', ok ? '✅' : '❌');
                      }).catch(e => console.warn('[FW Name] settings regeneration catch:', e));
                    }
                  },
                  'plain-text',
                  userProfile.name
                );
              }}
            >
              <View style={styles.settingsItemLeft}>
                <Text style={styles.settingsItemLabel}>Nome</Text>
                <Text style={styles.settingsItemValue}>{userProfile.name}</Text>
              </View>
              <MaterialIcons name="edit" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.settingsItem}
              onPress={() => {
                Alert.prompt(
                  'Aggiorna Peso Attuale',
                  'Inserisci il tuo peso attuale (kg)',
                  (text) => {
                    const weight = parseFloat(text);
                    if (weight && weight > 0) {
                      setUserProfile({ ...userProfile, weight });
                      setWeightHistory([...weightHistory, { date: new Date().toISOString(), weight }]);
                      syncWeightToHealth(weight);
                      checkWeightMilestone(weight);
                      saveAllData();
                    }
                  },
                  'plain-text',
                  userProfile.weight.toString()
                );
              }}
            >
              <View style={styles.settingsItemLeft}>
                <Text style={styles.settingsItemLabel}>Peso Attuale</Text>
                <Text style={styles.settingsItemValue}>{userProfile.weight} kg</Text>
              </View>
              <MaterialIcons name="edit" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.settingsItem}
              onPress={() => {
                Alert.prompt(
                  'Modifica Peso Obiettivo',
                  'Inserisci il tuo peso obiettivo (kg)',
                  (text) => {
                    const target = parseFloat(text);
                    if (target && target > 0 && target < userProfile.weight) {
                      setUserProfile({ ...userProfile, targetWeight: target });
                      generateProgram({ ...userProfile, targetWeight: target });
                      saveAllData();
                    } else {
                      Alert.alert('Errore', 'Il peso obiettivo deve essere inferiore al peso attuale');
                    }
                  },
                  'plain-text',
                  userProfile.targetWeight.toString()
                );
              }}
            >
              <View style={styles.settingsItemLeft}>
                <Text style={styles.settingsItemLabel}>Peso Obiettivo</Text>
                <Text style={styles.settingsItemValue}>{userProfile.targetWeight} kg</Text>
              </View>
              <MaterialIcons name="edit" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.settingsItem}
              onPress={() => setCurrentScreen('editTrainingDays')}
            >
              <View style={styles.settingsItemLeft}>
                <Text style={styles.settingsItemLabel}>Giorni Allenamento</Text>
                <Text style={styles.settingsItemValue}>{userProfile.trainingDays.length} giorni/settimana</Text>
              </View>
              <Text style={styles.settingsItemArrow}>→</Text>
            </TouchableOpacity>
          </View>

          {/* Voice Section */}
          <View style={styles.settingsSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialIcons name="mic" size={18} color={Colors.textSecondary} />
              <Text style={styles.settingsSectionTitle}>VOCE COACH</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 15 }}>
              {[
                { key: 'female', label: 'Donna', icon: 'face-3' },
                { key: 'male', label: 'Uomo', icon: 'face' },
              ].map((option) => {
                const isSelected = (userProfile.voicePreference || 'female') === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={{
                      flex: 1, marginHorizontal: 5, paddingVertical: 15, borderRadius: 12,
                      backgroundColor: isSelected ? '#0891b2' : 'rgba(255,255,255,0.3)',
                      alignItems: 'center',
                    }}
                    onPress={() => {
                      const updated = { ...userProfile, voicePreference: option.key as 'female' | 'male' };
                      setUserProfile(updated);
                      saveAllData({ profile: updated });
                      // Anteprima: riproduce workout_start_1 con la voce selezionata
                      const gender = (userProfile.gender || 'M').toLowerCase();
                      const folder = `${option.key}_${gender}`;
                      const audioFile = AUDIO_FILES[folder]?.['workout_start_1_seg1'];
                      console.log('[FW Preview] folder:', folder, 'file:', !!audioFile);
                      if (audioFile) {
                        startAudioPlayer(audioFile).then(ok => {
                          console.log('[FW Preview]', ok ? '✅ audio avviato' : '❌ audio fallito');
                        });
                      } else {
                        console.warn('[FW Preview] audioFile null per folder:', folder);
                        // Nessun fallback TTS (Step 1+5)
                      }
                    }}
                  >
                    <MaterialIcons name={option.icon as any} size={28} color={isSelected ? 'white' : 'rgba(255,255,255,0.8)'} />
                    <Text style={{ 
                      color: isSelected ? 'white' : 'rgba(255,255,255,0.8)', 
                      fontWeight: isSelected ? 'bold' : 'normal',
                      fontSize: 14, marginTop: 4
                    }}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, paddingHorizontal: 15, paddingBottom: 10 }}>
              Tocca per sentire un'anteprima della voce.
            </Text>
          </View>

          {/* Workout Preferences */}
          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>🏋️ ALLENAMENTO</Text>
            <TouchableOpacity 
              style={styles.settingsItem}
              onPress={() => {
                const current = userProfile.showVideoPreview !== false;
                setUserProfile({ ...userProfile, showVideoPreview: !current });
                saveAllData();
              }}
            >
              <View style={styles.settingsItemLeft}>
                <Text style={styles.settingsItemLabel}>Video di transizione</Text>
                <Text style={styles.settingsItemValue}>
                  {userProfile.showVideoPreview !== false 
                    ? 'Mostra il video ad ogni cambio fase' 
                    : 'Solo annuncio vocale'}
                </Text>
              </View>
              <Text style={styles.settingsItemArrow}>{userProfile.showVideoPreview !== false ? '✅' : '⬜'}</Text>
            </TouchableOpacity>
          </View>

          {/* Program Section */}
          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>🔔 PROMEMORIA</Text>
            <TouchableOpacity 
              style={styles.settingsItem}
              onPress={async () => {
                const newEnabled = !notificationPrefs.enabled;
                if (newEnabled) {
                  const granted = await setupNotifications();
                  if (!granted) return;
                }
                const newPrefs = { ...notificationPrefs, enabled: newEnabled };
                setNotificationPrefs(newPrefs);
                if (!newEnabled) {
                  await Notifications.cancelAllScheduledNotificationsAsync();
                }
                saveAllData();
              }}
            >
              <View style={styles.settingsItemLeft}>
                <Text style={styles.settingsItemLabel}>Notifiche allenamento</Text>
                <Text style={styles.settingsItemValue}>{notificationPrefs.enabled ? 'Attive' : 'Disattivate'}</Text>
              </View>
              <Text style={styles.settingsItemArrow}>{notificationPrefs.enabled ? '✅' : '⬜'}</Text>
            </TouchableOpacity>

            {notificationPrefs.enabled && (
              <TouchableOpacity 
                style={styles.settingsItem}
                onPress={() => {
                  const hours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);
                  ActionSheetIOS.showActionSheetWithOptions(
                    {
                      title: 'Orario promemoria',
                      message: 'A che ora vuoi essere avvisato?',
                      options: [...hours.filter((_, i) => i >= 6 && i <= 21), 'Annulla'],
                      cancelButtonIndex: 16,
                    },
                    (buttonIndex) => {
                      if (buttonIndex < 16) {
                        const hour = buttonIndex + 6;
                        const newPrefs = { ...notificationPrefs, hour, minute: 0 };
                        setNotificationPrefs(newPrefs);
                        saveAllData();
                      }
                    }
                  );
                }}
              >
                <View style={styles.settingsItemLeft}>
                  <Text style={styles.settingsItemLabel}>Orario</Text>
                  <Text style={styles.settingsItemValue}>{notificationPrefs.hour.toString().padStart(2, '0')}:{notificationPrefs.minute.toString().padStart(2, '0')}</Text>
                </View>
                <Text style={styles.settingsItemArrow}>🕐</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Nutrition Section */}
          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>🥗 ALIMENTAZIONE</Text>
            <TouchableOpacity 
              style={styles.settingsItem}
              onPress={() => {
                setShowNutritionTips(!showNutritionTips);
                saveAllData();
              }}
            >
              <View style={styles.settingsItemLeft}>
                <Text style={styles.settingsItemLabel}>Consigli Dieta Mediterranea</Text>
                <Text style={styles.settingsItemValue}>{showNutritionTips ? 'Visibili in Home' : 'Nascosti'}</Text>
              </View>
              <Text style={styles.settingsItemArrow}>{showNutritionTips ? '✅' : '⬜'}</Text>
            </TouchableOpacity>
          </View>

          {/* Apple Health Section */}
          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>❤️ APPLE SALUTE</Text>
            <TouchableOpacity 
              style={styles.settingsItem}
              onPress={async () => {
                if (!AppleHealthKit) {
                  Alert.alert('Apple Salute non disponibile', 'Questa funzione sarà disponibile nella versione finale dell\'app.');
                  return;
                }
                if (!healthSyncEnabled) {
                  const success = await initHealthSync();
                  if (success) {
                    setHealthSyncEnabled(true);
                    saveAllData();
                  }
                } else {
                  setHealthSyncEnabled(false);
                  saveAllData();
                }
              }}
            >
              <View style={styles.settingsItemLeft}>
                <Text style={styles.settingsItemLabel}>Sincronizza con Apple Salute</Text>
                <Text style={styles.settingsItemValue}>
                  {!AppleHealthKit 
                    ? 'Disponibile nella versione finale' 
                    : healthSyncEnabled 
                      ? 'Attiva — allenamenti, peso e calorie' 
                      : 'Disattivata'}
                </Text>
              </View>
              <Text style={styles.settingsItemArrow}>{!AppleHealthKit ? '🔒' : healthSyncEnabled ? '✅' : '⬜'}</Text>
            </TouchableOpacity>
            {healthSyncEnabled && (
              <View style={{ paddingHorizontal: 15, paddingBottom: 10 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>
                  I dati vengono sincronizzati automaticamente dopo ogni allenamento e aggiornamento peso.
                </Text>
              </View>
            )}
          </View>

          {/* Program Section (original) */}
          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>🎯 PROGRAMMA</Text>
            
            <View style={styles.settingsItem}>
              <View style={styles.settingsItemLeft}>
                <Text style={styles.settingsItemLabel}>Settimana Corrente</Text>
                <Text style={styles.settingsItemValue}>Settimana {currentWeek} di {weeksToGoal}</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.settingsItem}
              onPress={() => {
                Alert.alert(
                  'Resetta Programma',
                  'Vuoi ricominciare dalla Settimana 1? I tuoi dati storici verranno mantenuti.',
                  [
                    { text: 'Annulla', style: 'cancel' },
                    { 
                      text: 'Resetta',
                      style: 'destructive',
                      onPress: () => {
                        setCurrentWeek(1);
                        saveAllData();
                      }
                    }
                  ]
                );
              }}
            >
              <View style={styles.settingsItemLeft}>
                <Text style={styles.settingsItemLabel}>Resetta Programma</Text>
                <Text style={styles.settingsItemValue}>Ricomincia dalla settimana 1</Text>
              </View>
              <Text style={styles.settingsItemArrow}>🔄</Text>
            </TouchableOpacity>
          </View>

          {/* Data Section */}
          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>🗑️ DATI</Text>
            
            <TouchableOpacity 
              style={styles.settingsItem}
              onPress={() => {
                Alert.alert(
                  'Cancella Storico',
                  'Eliminare tutti gli allenamenti salvati? I badge verranno mantenuti.',
                  [
                    { text: 'Annulla', style: 'cancel' },
                    { 
                      text: 'Cancella',
                      style: 'destructive',
                      onPress: () => {
                        setWorkoutHistory([]);
                        saveAllData();
                      }
                    }
                  ]
                );
              }}
            >
              <View style={styles.settingsItemLeft}>
                <Text style={styles.settingsItemLabel}>Cancella Storico Allenamenti</Text>
                <Text style={styles.settingsItemValue}>{workoutHistory.length} allenamenti salvati</Text>
              </View>
              <Text style={styles.settingsItemArrow}>⚠️</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.settingsItem}
              onPress={() => {
                Alert.alert(
                  'Resetta Badge',
                  'Eliminare tutti i badge sbloccati? Dovrai risbloccarli.',
                  [
                    { text: 'Annulla', style: 'cancel' },
                    { 
                      text: 'Resetta',
                      style: 'destructive',
                      onPress: () => {
                        initializeBadges();
                        saveAllData();
                      }
                    }
                  ]
                );
              }}
            >
              <View style={styles.settingsItemLeft}>
                <Text style={styles.settingsItemLabel}>Resetta Badge</Text>
                <Text style={styles.settingsItemValue}>{badges.filter(b => b.unlocked).length} badge sbloccati</Text>
              </View>
              <Text style={styles.settingsItemArrow}>⚠️</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.settingsItem}
              onPress={() => {
                Alert.alert(
                  '⚠️ ATTENZIONE',
                  'Eliminare TUTTI i dati? Questa azione non può essere annullata!\n\n• Profilo\n• Storico allenamenti\n• Badge\n• Statistiche\n\nDovrai rifare l\'onboarding.',
                  [
                    { text: 'Annulla', style: 'cancel' },
                    { 
                      text: 'Elimina Tutto',
                      style: 'destructive',
                      onPress: async () => {
                        await AsyncStorage.clear();
                        setUserProfile({
                          name: '', age: 0, gender: '', weight: 0, height: 0,
                          targetWeight: 0, trainingDays: [], fitnessLevel: '',
                          weightLossSpeed: '', startDate: new Date().toISOString()
                        });
                        setWorkoutHistory([]);
                        setWeightHistory([]);
                        initializeBadges();
                        setCurrentWeek(1);
                        setCurrentScreen('welcome');
                      }
                    }
                  ]
                );
              }}
            >
              <View style={styles.settingsItemLeft}>
                <Text style={[styles.settingsItemLabel, { color: '#f44336' }]}>Resetta Tutto</Text>
                <Text style={styles.settingsItemValue}>Elimina tutti i dati dell'app</Text>
              </View>
              <Text style={styles.settingsItemArrow}>⚠️</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom Navigation */}
        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navButton} onPress={() => setCurrentScreen('dashboard')}>
            <MaterialIcons name="home" size={24} color={Colors.gray700} style={{opacity:0.4}} />
            <Text style={styles.navLabel}>Home</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} disabled={true}>
            <MaterialIcons name="bar-chart" size={24} color={Colors.gray700} style={{opacity:0.3}} />
            <Text style={[styles.navLabel, {opacity:0.3}]}>Statistiche</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} disabled={true}>
            <MaterialIcons name="emoji-events" size={24} color={Colors.gray700} style={{opacity:0.3}} />
            <Text style={[styles.navLabel, {opacity:0.3}]}>Trofei</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} disabled={true}>
            <MaterialIcons name="calendar-today" size={24} color={Colors.gray700} style={{opacity:0.3}} />
            <Text style={[styles.navLabel, {opacity:0.3}]}>Calendario</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => setShowWorkoutSettings(true)}>
            <MaterialIcons name="settings" size={24} color={Colors.accentBlue} />
            <Text style={styles.navLabelActive}>Opzioni</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Workout Screen (same as v2, keeping compact for space)
  if (currentScreen === 'workout') {
    const todayProgram = weeklyProgram[currentWeek - 1];
    if (!todayProgram) return null;

    const currentInterval = todayProgram.intervals[sessionData.currentIntervalIndex];
    let intervalStartTime = 0;
    for (let i = 0; i < sessionData.currentIntervalIndex; i++) {
      intervalStartTime += todayProgram.intervals[i].duration * 60;
    }
    
    const intervalElapsed = sessionData.elapsed - intervalStartTime;
    const intervalDuration = currentInterval.duration * 60;
    const intervalRemaining = intervalDuration - intervalElapsed;
    const intervalProgress = (intervalElapsed / intervalDuration) * 100;

    let totalDuration = 0;
    todayProgram.intervals.forEach(int => totalDuration += int.duration * 60);
    const totalRemaining = totalDuration - sessionData.elapsed;

    return (
      <LinearGradient
        colors={[Colors.workoutGradientTop, Colors.workoutGradientMid, Colors.workoutGradientBottom]}
        style={[styles.workoutContainer]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.3, y: 1 }}
      >
        {/* Indoor indicator */}
        {indoorMode && (
          <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', paddingVertical: 6, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <MaterialIcons name="fitness-center" size={14} color={Colors.orangeAccent} />
            <Text style={{ color: Colors.orangeAccent, fontSize: 12, fontWeight: '600' }}>INDOOR — Distanza stimata dai passi</Text>
          </View>
        )}
        {!indoorMode && showMap ? (
          <View style={styles.fullMapContainer}>
            {sessionData.route.length > 1 ? (
              <MapView
                ref={mapRef}
                style={styles.fullMap}
                initialRegion={{
                  latitude: sessionData.route[0].latitude,
                  longitude: sessionData.route[0].longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
              >
                <Polyline coordinates={sessionData.route} strokeColor={Colors.accentBlue} strokeWidth={6} />
                <Marker coordinate={sessionData.route[0]} title="Inizio" pinColor="green" />
                {sessionData.lastPosition && (
                  <Marker
                    coordinate={{
                      latitude: sessionData.lastPosition.latitude,
                      longitude: sessionData.lastPosition.longitude
                    }}
                    title="Posizione attuale"
                    pinColor="blue"
                  />
                )}
              </MapView>
            ) : (
              <View style={[styles.fullMap, { justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primaryDark }]}>
                <MaterialIcons name="location-on" size={48} color={Colors.accentBlue} />
                <Text style={{ fontSize: 18, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: 40, marginTop: 12 }}>
                  Cammina ancora un po'...{'\n'}La mappa apparirà appena il GPS rileva il percorso.
                </Text>
              </View>
            )}
            <TouchableOpacity style={styles.closeMapButton} onPress={toggleMap}>
              <Text style={styles.closeMapText}>Chiudi Mappa</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={styles.workoutScrollContent}>
            {/* GPS Header - Card trasparente */}
            <View style={{ backgroundColor: Colors.cardBg, marginHorizontal: 16, marginTop: 56, borderRadius: 16, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={styles.gpsIndicator}>
                <View style={[styles.gpsIconCircle, { backgroundColor: gpsAvailable ? Colors.healthGreen : Colors.redSoft }]} />
                <Text style={{ color: Colors.textPrimary, fontSize: 16, fontWeight: '500' }}>GPS</Text>
              </View>
              <Text style={{ color: Colors.textSecondary, fontSize: 15, fontWeight: '500' }}>Rimanente {formatTime(totalRemaining)}</Text>
              <TouchableOpacity onPress={() => setShowWorkoutSettings(true)}>
                <MaterialIcons name="settings" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Rettangolo bordo progressivo — sostituisce barra + timer */}
            {(() => {
              const phaseColor = (() => {
                const t = currentInterval.type;
                const s = currentInterval.speed;
                if (t === 'warmup' || t === 'cooldown') return '#FFFFFF';
                if (s === 'fast') return '#FFD166';
                return '#4FFFB0';
              })();

              // Dimensioni rettangolo
              const W = 320;
              const H = 140;
              const R = 28;
              const STROKE = 10;
              // Perimetro approssimato: 2*(W+H) - 8*R + 2*PI*R
              const perimeter = 2 * (W + H) - 8 * R + 2 * Math.PI * R;
              const progress = Math.min(Math.max(intervalProgress / 100, 0), 1);
              const dashLen = perimeter * progress;

              return (
                <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 8 }}>
                  <Text style={{ fontSize: 26, fontWeight: '900', color: phaseColor, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 }}>
                    {currentInterval.name}
                  </Text>
                  <View style={{ width: W, height: H }}>
                    <Svg width={W} height={H}>
                      {/* Traccia sfondo */}
                      <SvgRect
                        x={STROKE / 2}
                        y={STROKE / 2}
                        width={W - STROKE}
                        height={H - STROKE}
                        rx={R}
                        fill="none"
                        stroke="rgba(255,255,255,0.15)"
                        strokeWidth={STROKE}
                      />
                      {/* Bordo progressivo */}
                      <SvgRect
                        x={STROKE / 2}
                        y={STROKE / 2}
                        width={W - STROKE}
                        height={H - STROKE}
                        rx={R}
                        fill="none"
                        stroke={phaseColor}
                        strokeWidth={STROKE}
                        strokeDasharray={`${dashLen} ${perimeter}`}
                        strokeLinecap="round"
                      />
                    </Svg>
                    {/* Timer sovrapposto al centro */}
                    <View style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, justifyContent: 'center', alignItems: 'center' }}>
                      <Text style={{ fontSize: 68, fontWeight: '900', color: phaseColor, lineHeight: 72 }}>
                        {formatTime(intervalRemaining)}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 18, color: Colors.textSecondary, marginTop: 6 }}>
                    {sessionData.currentIntervalIndex + 1} / {todayProgram.intervals.length}
                  </Text>
                </View>
              );
            })()}

            {/* Metriche circolari */}
            <View style={styles.metricsRow}>
              <View style={styles.workoutMetricCircle}>
                <MaterialIcons name="straighten" size={26} color={Colors.accentBlue} />
                <Text style={styles.workoutMetricValue}>{(sessionData.distance / 1000).toFixed(2)}</Text>
                <Text style={styles.workoutMetricLabel}>Km</Text>
              </View>
              <View style={styles.workoutMetricCircle}>
                <MaterialIcons name="directions-walk" size={26} color={Colors.healthGreen} />
                <Text style={styles.workoutMetricValue}>{sessionData.steps}</Text>
                <Text style={styles.workoutMetricLabel}>Passi</Text>
              </View>
              <View style={styles.workoutMetricCircle}>
                <MaterialIcons name="local-fire-department" size={26} color={Colors.orangeAccent} />
                <Text style={styles.workoutMetricValue}>{Math.round((sessionData.distance / 1000) * 65)}</Text>
                <Text style={styles.workoutMetricLabel}>Kcal</Text>
              </View>
            </View>

            {pedometerAvailable && sessionData.cadence > 0 && (
              <View style={styles.cadenceCard}>
                <Text style={styles.cadenceValue}>{sessionData.cadence}</Text>
                <Text style={styles.cadenceLabel}>passi/min</Text>
              </View>
            )}

            {/* Pulsanti centrali: mappa, play/pausa, musica */}
            <View style={styles.workoutControls}>
              {!indoorMode ? (
                <TouchableOpacity style={styles.workoutBtnCircle} onPress={toggleMap}>
                  <MaterialIcons name="map" size={28} color={Colors.textPrimary} />
                </TouchableOpacity>
              ) : (
                <View style={[styles.workoutBtnCircle, { opacity: 0.3 }]}>
                  <MaterialIcons name="fitness-center" size={28} color={Colors.orangeAccent} />
                </View>
              )}
              {/* Banner RIPRENDI — appare quando si torna da Spotify/Music */}
            {returnedFromBackground && !isWorkoutActive && (
              <TouchableOpacity
                onPress={() => {
                  setReturnedFromBackground(false);
                  setIsWorkoutActive(true);
                  setSessionData(prev => ({ ...prev, isActive: true }));
                  speakMessage('resume', { name: userProfile.name });
                }}
                style={{
                  marginHorizontal: 20,
                  marginBottom: 16,
                  backgroundColor: Colors.healthGreen,
                  borderRadius: 16,
                  paddingVertical: 18,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 10,
                }}
              >
                <MaterialIcons name="play-arrow" size={32} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.5 }}>
                  RIPRENDI ALLENAMENTO
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.workoutBtnCircleLarge} onPress={togglePause}>
                <MaterialIcons name={isWorkoutActive ? 'pause' : 'play-arrow'} size={36} color={Colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.workoutBtnCircle} onPress={() => {
                ActionSheetIOS.showActionSheetWithOptions(
                  {
                    title: 'Avvia la musica',
                    message: 'Il coaching vocale si sovrapporrà alla musica.',
                    options: ['Apple Music', 'Spotify', 'Annulla'],
                    cancelButtonIndex: 2,
                  },
                  (buttonIndex) => {
                    if (buttonIndex === 0) {
                      Linking.openURL('music://');
                    } else if (buttonIndex === 1) {
                      Linking.openURL('spotify://').catch(() => {
                        Alert.alert('Spotify non installato', 'Installa Spotify dall\'App Store per usare questa opzione.');
                      });
                    }
                  }
                );
              }}>
                <MaterialIcons name="music-note" size={28} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Messaggio pausa musica */}
            {!isWorkoutActive && (
              <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 8, paddingHorizontal: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, gap: 8 }}>
                  <MaterialIcons name="music-off" size={20} color={Colors.textSecondary} />
                  <Text style={{ color: Colors.textSecondary, fontSize: 14, fontWeight: '500' }}>In pausa. Se vuoi, metti in pausa anche la musica</Text>
                </View>
              </View>
            )}

            {/* Skip controls */}
            <View style={styles.skipControlsRow}>
              <TouchableOpacity style={styles.workoutSkipBtn} onPress={skipToPreviousInterval}>
                <MaterialIcons name="skip-previous" size={22} color={Colors.textPrimary} />
                <Text style={{ color: Colors.textPrimary, fontSize: 15, fontWeight: '800' }}>Precedente</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.workoutSkipBtn, { borderColor: Colors.redSoft, borderWidth: 1 }]} onPress={stopWorkout}>
                <MaterialIcons name="stop" size={22} color={Colors.redSoft} />
                <Text style={{ color: Colors.redSoft, fontSize: 15, fontWeight: '800' }}>Termina</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.workoutSkipBtn} onPress={skipToNextInterval}>
                <Text style={{ color: Colors.textPrimary, fontSize: 15, fontWeight: '800' }}>Successivo</Text>
                <MaterialIcons name="skip-next" size={22} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Mini mappa percorso inline */}
            {!indoorMode && sessionData.route.length > 1 && (
              <View style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 8, borderRadius: 20, overflow: 'hidden', height: 160 }}>
                <MapView
                  style={{ flex: 1 }}
                  initialRegion={{
                    latitude: sessionData.route[sessionData.route.length - 1].latitude,
                    longitude: sessionData.route[sessionData.route.length - 1].longitude,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                >
                  <Polyline coordinates={sessionData.route} strokeColor={Colors.healthGreen} strokeWidth={4} />
                  <Marker coordinate={sessionData.route[0]} pinColor="green" />
                  {sessionData.lastPosition && (
                    <Marker
                      coordinate={{ latitude: sessionData.lastPosition.latitude, longitude: sessionData.lastPosition.longitude }}
                      pinColor="blue"
                    />
                  )}
                </MapView>
              </View>
            )}

          </ScrollView>
        )}

        {/* Video Preview Modal durante allenamento */}
        <Modal visible={showPhasePreview} animationType="fade" transparent={false}>
          <View style={styles.previewModal}>
            {phasePreviewVideo && showPhasePreview && (
              <Video
                key={phasePreviewTitle}
                source={phasePreviewVideo}
                style={styles.previewVideo}
                resizeMode={ResizeMode.COVER}
                shouldPlay={true}
                isLooping={true}
                isMuted={true}
              />
            )}
            <View style={styles.previewOverlay}>
              <Text style={styles.previewTitle}>{phasePreviewTitle}</Text>
              <Text style={styles.previewSub}>{phasePreviewSub}</Text>
              <TouchableOpacity
                style={styles.previewStartBtn}
                onPress={() => setShowPhasePreview(false)}
              >
                <LinearGradient colors={[Colors.healthGreen, Colors.successGreen]} style={styles.previewStartGradient}>
                  <MaterialIcons name="play-arrow" size={28} color={Colors.textPrimary} />
                  <Text style={styles.previewStartText}>Visto! Continua</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.previewSkipBtn}
                onPress={() => setShowPhasePreview(false)}
              >
                <Text style={styles.previewSkipText}>Salta video</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Paywall Premium */}
        <Modal visible={showPaywall} animationType="slide">
          <PaywallScreen
            onClose={() => setShowPaywall(false)}
            onPurchaseSuccess={() => {
              setShowPaywall(false);
              refreshStatus();
            }}
          />
        </Modal>

        {/* Pannello impostazioni rapido durante allenamento */}
        <Modal visible={showWorkoutSettings} animationType="slide" transparent={true}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <View style={{ backgroundColor: Colors.primaryDark, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
              <Text style={{ color: Colors.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 20 }}>⚙️ Impostazioni</Text>

              {/* Voce */}
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 10 }}>VOCE COACH</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                {[{ key: 'female', label: '👩 Tammy' }, { key: 'male', label: '👨 Matteo' }].map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => {
                      const updated = { ...userProfile, voicePreference: opt.key as 'female' | 'male' };
                      setUserProfile(updated);
                      saveAllData({ profile: updated });
                    }}
                    style={{
                      flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
                      backgroundColor: (userProfile.voicePreference || 'female') === opt.key ? Colors.accentBlue : Colors.cardBg,
                    }}
                  >
                    <Text style={{ color: Colors.textPrimary, fontWeight: '700' }}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Indoor/Outdoor */}
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 10 }}>MODALITÀ</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 28 }}>
                {[{ key: false, label: '🌳 All\'aperto' }, { key: true, label: '🏠 Indoor' }].map(opt => (
                  <TouchableOpacity
                    key={String(opt.key)}
                    onPress={() => setIndoorMode(opt.key)}
                    style={{
                      flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
                      backgroundColor: indoorMode === opt.key ? Colors.healthGreen : Colors.cardBg,
                    }}
                  >
                    <Text style={{ color: Colors.textPrimary, fontWeight: '700' }}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                onPress={() => setShowWorkoutSettings(false)}
                style={{ backgroundColor: Colors.cardBg, borderRadius: 12, paddingVertical: 16, alignItems: 'center' }}
              >
                <Text style={{ color: Colors.textPrimary, fontSize: 16, fontWeight: '700' }}>Chiudi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </LinearGradient>
    );
  }

  // Summary Screen
  if (currentScreen === 'summary') {
    const lastWorkout = workoutHistory[0];
    
    return (
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryEmoji}>🎉</Text>
          <Text style={styles.summaryTitle}>Allenamento Completato!</Text>
          <Text style={styles.summarySubtitle}>Ottimo lavoro, {userProfile.name}!</Text>
          
          <View style={styles.summaryStats}>
            <View style={styles.summaryStatItem}>
              <Text style={styles.summaryStatValue}>{lastWorkout.distance}</Text>
              <Text style={styles.summaryStatLabel}>Km percorsi</Text>
            </View>
            <View style={styles.summaryStatItem}>
              <Text style={styles.summaryStatValue}>{Math.floor(lastWorkout.duration / 60)}</Text>
              <Text style={styles.summaryStatLabel}>Minuti</Text>
            </View>
            <View style={styles.summaryStatItem}>
              <Text style={styles.summaryStatValue}>{lastWorkout.steps}</Text>
              <Text style={styles.summaryStatLabel}>Passi</Text>
            </View>
          </View>

          <View style={styles.summaryExtraStats}>
            <Text style={styles.summaryExtraStat}>{lastWorkout.calories} kcal bruciate</Text>
            <Text style={styles.summaryExtraStat}>⚡ {lastWorkout.cadence} passi/min</Text>
          </View>

          {/* v5.0: Equivalenza calorie — messaggio random singolo */}
          {showNutritionTips && lastWorkout.calories > 0 && (() => {
            const eq = getCalorieEquivalence(lastWorkout.calories);
            if (!eq) return null;
            return (
              <View style={{ backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 16, padding: 16, marginTop: 16, width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <MaterialIcons name={eq.icon as any} size={28} color={Colors.healthGreen} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.textPrimary, fontSize: 14, lineHeight: 20 }}>
                    Hai bruciato <Text style={{ fontWeight: '700', color: Colors.healthGreen }}>{lastWorkout.calories} kcal</Text>, equivalente a {eq.name}!
                  </Text>
                </View>
              </View>
            );
          })()}

          {/* Salva percorso (solo outdoor con route) */}
          {!indoorMode && lastWorkout.route && lastWorkout.route.length > 5 && (
            <TouchableOpacity 
              onPress={() => {
                Alert.prompt(
                  'Salva Percorso',
                  'Dai un nome a questo percorso (es. "Giro Lungomare")',
                  (name) => {
                    if (name && name.trim()) {
                      saveRoute(name.trim(), lastWorkout.route, parseFloat(lastWorkout.distance));
                      Alert.alert('Salvato!', `Percorso "${name.trim()}" salvato nei tuoi preferiti.`);
                    }
                  },
                  'plain-text',
                  ''
                );
              }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12, paddingVertical: 12, backgroundColor: 'rgba(59,130,246,0.12)', borderRadius: 12, width: '100%' }}
            >
              <MaterialIcons name="bookmark-add" size={20} color={Colors.accentBlue} />
              <Text style={{ color: Colors.accentBlue, fontSize: 14, fontWeight: '600' }}>Salva Percorso</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.primaryButton} onPress={() => setCurrentScreen('dashboard')}>
            <Text style={styles.primaryButtonText}>Torna alla Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

// ============= STYLES (Compact version with new styles added) =============

const styles = StyleSheet.create({
  // Container & Welcome
  container: { flex: 1, backgroundColor: Colors.primaryDark },
  welcomeContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  appIcon: { fontSize: 80, marginBottom: 20 },
  appTitle: { fontSize: 48, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16 },
  appSubtitle: { fontSize: 18, color: Colors.textSecondary, textAlign: 'center', lineHeight: 28, marginBottom: 60 },
  primaryButton: { backgroundColor: Colors.healthGreen, paddingVertical: 18, paddingHorizontal: 48, borderRadius: 14, minWidth: 200, alignItems: 'center' },
  primaryButtonText: { fontSize: 18, fontWeight: '600', color: Colors.white },
  primaryButtonDisabled: { backgroundColor: 'rgba(16, 185, 129, 0.3)' },
  
  // Onboarding
  onboardingContainer: { flex: 1, backgroundColor: Colors.primaryDark },
  onboardingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60 },
  backButton: { fontSize: 16, color: Colors.accentBlue, fontWeight: '600' },
  stepIndicator: { fontSize: 14, color: Colors.textSecondary },
  stepContent: { padding: 30 },
  stepTitle: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary, marginBottom: 30 },
  stepHint: { fontSize: 14, color: Colors.textSecondary, marginTop: 16, textAlign: 'center' },
  input: { fontSize: 18, padding: 16, borderWidth: 2, borderColor: Colors.gray200, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', color: Colors.textPrimary },
  inputLarge: { fontSize: 32, fontWeight: '600', textAlign: 'center', color: Colors.textPrimary },
  inputWithUnit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  unitText: { fontSize: 24, color: Colors.textSecondary, fontWeight: '500' },
  genderButtons: { flexDirection: 'row', gap: 16 },
  genderButton: { flex: 1, padding: 24, borderWidth: 2, borderColor: Colors.gray200, borderRadius: 16, alignItems: 'center' },
  genderButtonActive: { borderColor: Colors.accentBlue, backgroundColor: 'rgba(59,130,246,0.15)' },
  genderButtonText: { fontSize: 18, color: Colors.textSecondary, fontWeight: '600' },
  genderButtonTextActive: { color: Colors.accentBlue },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dayButton: { width: '13%', aspectRatio: 1, borderWidth: 2, borderColor: Colors.gray200, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  dayButtonActive: { borderColor: Colors.accentBlue, backgroundColor: Colors.accentBlue },
  dayButtonText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  dayButtonTextActive: { color: Colors.white },
  levelButton: { padding: 20, borderWidth: 2, borderColor: Colors.gray200, borderRadius: 16, marginBottom: 12 },
  levelButtonActive: { borderColor: Colors.accentBlue, backgroundColor: 'rgba(59,130,246,0.15)' },
  levelButtonTitle: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  continueButton: { margin: 30, marginTop: 40 },
  
  // Dashboard Main
  dashboardMain: { flex: 1, backgroundColor: Colors.primaryDark },
  dashboardContainer: { flex: 1, backgroundColor: Colors.primaryDark },
  dashboardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, paddingBottom: 20 },
  dashboardTitle: { fontSize: 32, fontWeight: '800', color: Colors.textPrimary },
  headerIcons: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  headerIcon: { fontSize: 24 },
  welcomeText: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, paddingHorizontal: 20, paddingTop: 10 },
  goalText: { fontSize: 15, color: Colors.textSecondary, paddingHorizontal: 20, paddingBottom: 20 },

  // Quick Stats - Circular
  quickStatsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 20 },
  quickStatCard: { flex: 1, backgroundColor: Colors.cardBg, padding: 16, borderRadius: 20, alignItems: 'center' },
  quickStatValue: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, marginTop: 8, marginBottom: 2 },
  quickStatLabel: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', fontWeight: '600' },
  circleMetric: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: Colors.orangeAccent, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)' },

  progressCard: { backgroundColor: Colors.cardBg, margin: 20, marginTop: 0, padding: 24, borderRadius: 20 },
  progressTitle: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary, marginBottom: 12 },
  progressBar: { height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: Colors.healthGreen },
  progressPercent: { fontSize: 14, color: Colors.textSecondary, marginTop: 8, textAlign: 'right' },
  nextSessionCard: { backgroundColor: Colors.cardBg, marginHorizontal: 20, marginBottom: 20, padding: 24, borderRadius: 24 },
  nextSessionTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16 },
  sessionInfo: { flexDirection: 'row', alignItems: 'flex-end' },
  sessionDay: { fontSize: 64, color: Colors.accentBlue, fontWeight: '900' },
  sessionCalories: { fontSize: 28, color: Colors.textSecondary, fontWeight: '700' },
  startButton: { padding: 18, borderRadius: 16, alignItems: 'center' },
  startButtonText: { fontSize: 18, fontWeight: '700', color: Colors.white, letterSpacing: 1 },
  coverageCard: { backgroundColor: Colors.cardBg, marginHorizontal: 20, marginBottom: 100, padding: 24, borderRadius: 24 },
  coverageTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginBottom: 20 },
  coverageRow: { flexDirection: 'row', gap: 20, marginBottom: 16 },
  coverageItem: { flex: 1, alignItems: 'center' },
  coverageEmoji: { fontSize: 36, marginBottom: 8 },
  coveragePercent: { fontSize: 32, fontWeight: '700', color: Colors.textPrimary },
  coverageLabel: { fontSize: 14, color: Colors.textSecondary, marginTop: 4, fontWeight: '600' },
  circleDeficit: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)' },
  circleDeficitText: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  
  // Bottom Navigation - Dark
  bottomNav: { 
    flexDirection: 'row', 
    backgroundColor: Colors.primaryDark, 
    borderTopWidth: 1, 
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
    paddingTop: 8,
  },
  navButton: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  navIcon: { fontSize: 24, marginBottom: 4, opacity: 0.4 },
  navIconActive: { fontSize: 24, marginBottom: 4, opacity: 1 },
  navLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  navLabelActive: { fontSize: 11, color: Colors.accentBlue, fontWeight: '700' },

  // Screen Headers
  screenHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, backgroundColor: Colors.primaryDark },
  screenTitle: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary },

  // Period Selector
  periodSelector: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginVertical: 20 },
  periodButton: { flex: 1, padding: 12, borderWidth: 2, borderColor: Colors.gray200, borderRadius: 12, alignItems: 'center' },
  periodButtonActive: { borderColor: Colors.accentBlue, backgroundColor: 'rgba(59,130,246,0.15)' },
  periodButtonText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  periodButtonTextActive: { color: Colors.accentBlue },

  // Charts
  chartCard: { backgroundColor: Colors.cardBg, marginHorizontal: 20, marginBottom: 20, padding: 20, borderRadius: 20, alignItems: 'center' },
  chartTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16, alignSelf: 'flex-start' },
  chart: { borderRadius: 16 },

  // Achievements
  achievementsGrid: { padding: 20, gap: 16, paddingBottom: 100 },
  badgeCard: { backgroundColor: Colors.cardBg, padding: 20, borderRadius: 20, alignItems: 'center' },
  badgeCardLocked: { opacity: 0.4 },
  badgeIcon: { fontSize: 48, marginBottom: 12 },
  badgeTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  badgeDescription: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: 16 },
  badgeUnlocked: { alignItems: 'center' },
  badgeUnlockedText: { fontSize: 14, fontWeight: '600', color: Colors.healthGreen, marginBottom: 4 },
  badgeDate: { fontSize: 12, color: Colors.textSecondary },
  badgeProgress: { width: '100%' },
  badgeProgressBar: { height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  badgeProgressFill: { height: '100%', backgroundColor: Colors.healthGreen },
  badgeProgressText: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },

  // Calendar
  calendarStats: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 20 },
  calendarStatItem: { flex: 1, backgroundColor: Colors.cardBg, padding: 16, borderRadius: 20, alignItems: 'center' },
  calendarStatValue: { fontSize: 28, fontWeight: '700', color: Colors.accentBlue, marginBottom: 4 },
  calendarStatLabel: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  calendarCard: { backgroundColor: Colors.cardBg, marginHorizontal: 20, marginBottom: 100, padding: 20, borderRadius: 20 },
  calendarMonth: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginBottom: 20, textAlign: 'center' },
  calendarWeekDays: { flexDirection: 'row', marginBottom: 12 },
  calendarWeekDay: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarDayContainer: { width: '14.28%', aspectRatio: 1, padding: 2 },
  calendarDay: { flex: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  calendarDayWorkout: { backgroundColor: Colors.healthGreen },
  calendarDayToday: { backgroundColor: Colors.accentBlue },
  calendarDayPlanned: { backgroundColor: Colors.orangeAccent },
  calendarDayEmpty: { flex: 1 },
  calendarDayText: { fontSize: 14, color: Colors.textSecondary },
  calendarDayTextWorkout: { color: Colors.white, fontWeight: '600' },
  calendarDayTextToday: { color: Colors.white, fontWeight: '600' },
  calendarDot: { fontSize: 6, color: Colors.white, marginTop: 2 },
  calendarLegend: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: Colors.gray200 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 12, color: Colors.textSecondary },

  // Settings
  settingsSection: { backgroundColor: Colors.cardBg, marginHorizontal: 20, marginBottom: 20, borderRadius: 20, overflow: 'hidden' },
  settingsSectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, padding: 20, paddingBottom: 12, backgroundColor: 'rgba(255,255,255,0.03)', letterSpacing: 0.5, textTransform: 'uppercase' },
  settingsItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.gray200 },
  settingsItemLeft: { flex: 1 },
  settingsItemLabel: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  settingsItemValue: { fontSize: 14, color: Colors.textSecondary },
  settingsItemArrow: { fontSize: 20, marginLeft: 12 },

  // Workout Premium
  workoutContainer: { flex: 1, backgroundColor: Colors.primaryDark },
  workoutScrollContent: { flex: 1 },
  workoutTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60 },
  gpsIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gpsIconCircle: { width: 12, height: 12, borderRadius: 6 },
  gpsText: { color: Colors.textPrimary, fontSize: 16, fontWeight: '500' },
  remainingTimeText: { color: Colors.textSecondary, fontSize: 15, fontWeight: '500' },
  settingsIcon: { padding: 8 },
  settingsText: { fontSize: 24 },
  progressBarTop: { height: 6, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 20, marginTop: 16, marginBottom: 20, borderRadius: 3, overflow: 'hidden' },
  progressBarFillWhite: { height: '100%', borderRadius: 3 },
  phaseDisplayLarge: { alignItems: 'center', paddingVertical: 15 },
  phaseNameLarge: { fontSize: 28, fontWeight: '900', color: Colors.textPrimary, marginBottom: 10, letterSpacing: 2 },
  phaseTimerLarge: { fontSize: 72, fontWeight: '900', color: Colors.textPrimary, marginBottom: 6 },
  phaseProgressLarge: { fontSize: 20, color: Colors.textSecondary, marginBottom: 12 },
  metricsRow: { flexDirection: 'row', gap: 16, marginBottom: 10, paddingHorizontal: 20 },
  workoutMetricCircle: { flex: 1, backgroundColor: Colors.cardBg, borderRadius: 56, paddingVertical: 16, alignItems: 'center' },
  workoutMetricValue: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, marginTop: 4 },
  workoutMetricLabel: { fontSize: 14, color: Colors.textSecondary, fontWeight: '700', marginTop: 2 },
  metricCardDark: { flex: 1, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, alignItems: 'center' },
  metricValueDark: { fontSize: 22, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
  metricLabelDark: { fontSize: 13, color: Colors.textSecondary },
  cadenceCard: { backgroundColor: Colors.cardBg, marginHorizontal: 20, padding: 16, borderRadius: 16, alignItems: 'center', marginBottom: 10 },
  cadenceValue: { fontSize: 32, fontWeight: '700', color: Colors.textPrimary },
  cadenceLabel: { fontSize: 14, color: Colors.textSecondary },
  workoutControls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 35, marginTop: 20, marginBottom: 20 },
  workoutBtnCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  workoutBtnCircleLarge: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
  controlButtonCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  controlButtonCircleLarge: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  controlButtonIcon: { fontSize: 24 },
  controlButtonIconLarge: { fontSize: 32 },
  skipControlsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15, paddingHorizontal: 16, marginBottom: 25, gap: 8 },
  workoutSkipBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, gap: 3 },
  skipButtonWide: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, paddingHorizontal: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, gap: 6 },
  skipButtonIconLarge: { color: Colors.textPrimary, fontSize: 20, fontWeight: 'bold' },
  skipButtonText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
  fullMapContainer: { flex: 1 },
  fullMap: { flex: 1 },
  closeMapButton: { position: 'absolute', top: 60, right: 20, backgroundColor: Colors.primaryDark, padding: 12, borderRadius: 20 },
  closeMapText: { fontSize: 16, fontWeight: '600', color: Colors.accentBlue },
  
  // Summary
  summaryContainer: { flex: 1, backgroundColor: Colors.primaryDark, justifyContent: 'center', alignItems: 'center', padding: 20 },

  // Video Preview Modal
  previewModal: { flex: 1, backgroundColor: '#000' },
  previewVideo: { width: '100%', height: '65%' },
  previewOverlay: { flex: 1, backgroundColor: Colors.primaryDark, paddingHorizontal: 24, paddingTop: 30, alignItems: 'center' },
  previewTitle: { fontSize: 32, fontWeight: '900', color: Colors.textPrimary, letterSpacing: 2, marginBottom: 8 },
  previewSub: { fontSize: 16, color: Colors.textSecondary, textAlign: 'center', marginBottom: 30 },
  previewStartBtn: { width: '100%', marginBottom: 16 },
  previewStartGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 16, gap: 8 },
  previewStartText: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  previewSkipBtn: { paddingVertical: 12 },
  previewSkipText: { fontSize: 15, color: Colors.textSecondary, fontWeight: '500' },
  summaryCard: { backgroundColor: Colors.cardBg, borderRadius: 24, padding: 40, alignItems: 'center', maxWidth: 400, width: '100%' },
  summaryEmoji: { fontSize: 72, marginBottom: 20 },
  summaryTitle: { fontSize: 28, fontWeight: '700', color: Colors.accentBlue, marginBottom: 8 },
  summarySubtitle: { fontSize: 16, color: Colors.textSecondary, marginBottom: 30 },
  summaryStats: { flexDirection: 'row', gap: 24, marginBottom: 20 },
  summaryStatItem: { alignItems: 'center' },
  summaryStatValue: { fontSize: 32, fontWeight: '700', color: Colors.textPrimary },
  summaryStatLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  summaryExtraStats: { gap: 8, marginBottom: 30 },
  summaryExtraStat: { fontSize: 16, color: Colors.textSecondary },
});
