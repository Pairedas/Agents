// Tests de la logique métier : node caisses/tests/test_logique.js
// Extrait le bloc LOGIQUE-DEBUT … LOGIQUE-FIN de index.html et vérifie les règles de calcul.
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const bloc = html.split('/*LOGIQUE-DEBUT*/')[1].split('/*LOGIQUE-FIN*/')[0];
const L = new Function(bloc + '\nreturn L;')();
let n = 0;
const test = (nom, f) => { f(); n++; console.log('ok  ' + nom); };
const T0 = new Date(2026, 9, 2, 10, 0).getTime();
const neuf = () => { const st = L.etatInitial(T0); st.departConfigure = true; return st; };

test('état initial : deux points Orange Money', () => {
  const st = neuf();
  assert.deepStrictEqual(st.caisses.map(c => c.nom), ['PRADEX', 'OM Makora', 'OM Apsonic 3', 'Salon', 'Perso']);
  assert.ok(L.caisse(st, 'om').pdv && L.caisse(st, 'om2').pdv);
});

test('prêt PRADEX → OM Makora : soldes et dette', () => {
  const st = neuf();
  L.caisse(st, 'pradex').soldeDepart = 50000;
  L.creerPret(st, { de: 'pradex', vers: 'om', montant: 10000, note: 'Recharge UV' }, T0);
  assert.strictEqual(L.soldeAttendu(st, 'pradex'), 40000);
  assert.strictEqual(L.soldeAttendu(st, 'om'), 10000);
  assert.strictEqual(L.detteEntre(st, 'om', 'pradex'), 10000);
});

test('motif obligatoire pour prêt et transfert', () => {
  const st = neuf();
  assert.throws(() => L.creerPret(st, { de: 'pradex', vers: 'om', montant: 1000, note: ' ' }, T0), /motif/);
  assert.throws(() => L.creerApport(st, { de: 'perso', vers: 'salon', montant: 1000 }, T0), /motif/);
});

test('investissement dans le salon : pas de dette', () => {
  const st = neuf();
  L.caisse(st, 'perso').soldeDepart = 300000;
  const mv = L.creerApport(st, { de: 'perso', vers: 'salon', montant: 100000, note: 'Carrelage' }, T0);
  assert.strictEqual(mv.categorie, 'Investissement');
  assert.strictEqual(L.soldeAttendu(st, 'perso'), 200000);
  assert.strictEqual(L.soldeAttendu(st, 'salon'), 100000);
  assert.strictEqual(L.dettes(st).length, 0);
  const d = L.decomposition(st, 'salon', null, null);
  assert.strictEqual(d.apportsRecus, 100000); assert.strictEqual(d.net, 100000);
});

test('suivi du salon : apports, dépenses directes, budget', () => {
  const st = neuf();
  st.reglages.budgetSalon = 500000;
  L.creerApport(st, { de: 'perso', vers: 'salon', montant: 100000, note: 'Carrelage' }, T0);
  L.creerApport(st, { de: 'pradex', vers: 'salon', montant: 50000, note: 'Peinture' }, T0);
  L.creerOperation(st, { type: 'sortie', caisse: 'salon', montant: 80000, categorie: 'Matériel', note: 'Fauteuils' }, T0);
  L.creerOperation(st, { type: 'sortie', caisse: 'perso', montant: 20000, categorie: 'Main-d’œuvre', note: 'Maçon', pourSalon: true }, T0);
  L.creerOperation(st, { type: 'sortie', caisse: 'perso', montant: 5000, categorie: 'Nourriture' }, T0);
  const s = L.suiviSalon(st, T0 + 1);
  assert.strictEqual(s.investi, 170000);
  assert.strictEqual(s.depense, 100000);
  assert.strictEqual(s.solde, 70000);
  assert.strictEqual(s.resteBudget, 330000);
  assert.deepStrictEqual(s.parSource.map(x => [x.cle, x.montant]), [['perso', 120000], ['pradex', 50000]]);
  assert.deepStrictEqual(s.parPoste.map(x => x.cle), ['Matériel', 'Main-d’œuvre']);
  assert.strictEqual(L.bilanMois(st, '2026-10', T0 + 1).total.investiSalon, 170000);
});

test('pourSalon ignoré sur la caisse Salon elle-même', () => {
  const st = neuf();
  const mv = L.creerOperation(st, { type: 'sortie', caisse: 'salon', montant: 1000, pourSalon: true }, T0);
  assert.strictEqual(mv.pourSalon, undefined);
});

test('clôture point OM : électronique + espèces', () => {
  const st = neuf();
  L.creerPret(st, { de: 'pradex', vers: 'om', montant: 10000, note: 'Recharge' }, T0);
  const cl = L.cloturer(st, 'om', 10000, T0 + 1000, { electronique: 6000, especes: 4000 });
  assert.deepStrictEqual(cl.detail, { electronique: 6000, especes: 4000 });
  assert.strictEqual(L.ecartActuel(st, cl), 0);
  assert.throws(() => L.cloturer(st, 'om', 10000, T0 + 2000, { electronique: 1, especes: 1 }), /total/);
  const st2 = L.normaliser(JSON.parse(JSON.stringify(st)));
  assert.deepStrictEqual(st2.clotures[0].detail, { electronique: 6000, especes: 4000 });
});

test('migration v1 : Orange Money → OM Makora + OM Apsonic 3 à configurer', () => {
  const v1 = { app: 'caisses-herve', version: 1, creeLe: T0, departConfigure: true,
    caisses: [{ id: 'pradex', nom: 'PRADEX', soldeDepart: 1000 }, { id: 'om', nom: 'Orange Money', soldeDepart: 2000 }, { id: 'salon', nom: 'Salon' }, { id: 'perso', nom: 'Perso' }],
    mouvements: [{ id: 'm1', type: 'pret', de: 'pradex', vers: 'om', montant: 500, quand: T0 }], clotures: [], reglages: { caissePerso: 'perso' } };
  const st = L.normaliser(v1);
  assert.deepStrictEqual(st.caisses.map(c => c.nom), ['PRADEX', 'OM Makora', 'OM Apsonic 3', 'Salon', 'Perso']);
  assert.ok(L.caisse(st, 'om2').aConfigurer);
  assert.strictEqual(L.soldeAttendu(st, 'om'), 2500);
  assert.strictEqual(st.reglages.caisseSalon, 'salon');
  assert.strictEqual(st.version, 2);
  // relire un état v2 ne rajoute rien
  const st2 = L.normaliser(JSON.parse(JSON.stringify(st)));
  assert.strictEqual(st2.caisses.length, 5);
});

test('point du soir : résumé et texte', () => {
  const st = neuf();
  L.caisse(st, 'pradex').soldeDepart = 50000;
  L.creerPret(st, { de: 'pradex', vers: 'om', montant: 10000, note: 'Recharge UV' }, T0);
  L.creerOperation(st, { type: 'sortie', caisse: 'pradex', montant: 2000, categorie: 'Transport', note: 'Taxi' }, T0 + 1);
  L.cloturer(st, 'om', 9000, T0 + 2);
  const r = L.resumeJour(st, '2026-10-02', T0 + 3);
  assert.strictEqual(r.sorties, 2000);
  assert.strictEqual(r.transferts.length, 1);
  assert.strictEqual(r.caisses.find(x => x.caisse === 'pradex').variation, -12000);
  assert.strictEqual(r.ecarts.length, 1);
  const t = L.texteResume(st, r).replace(/\u00a0/g, ' ');
  assert.ok(/PRADEX → OM Makora : 10 000 F \(prêt\) — Recharge UV/.test(t), t);
  assert.ok(/OM Makora doit 10 000 F à PRADEX/.test(t));
  assert.ok(/il manque 1 000 F/.test(t));
});

test('apport : suppression et normalisation', () => {
  const st = neuf();
  const mv = L.creerApport(st, { de: 'perso', vers: 'salon', montant: 1000, note: 'Test' }, T0);
  const st2 = L.normaliser(JSON.parse(JSON.stringify(st)));
  assert.strictEqual(st2.mouvements[0].type, 'apport');
  L.supprimerMouvement(st, mv.id);
  assert.strictEqual(L.soldeAttendu(st, 'salon'), 0);
});

console.log('\n' + n + ' tests réussis');
