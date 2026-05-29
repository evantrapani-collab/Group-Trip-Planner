/**
 * Pure expense-splitting math. No DB access here so it can be unit tested
 * in isolation and reasoned about easily.
 */

const round = (n) => Math.round(n * 100) / 100;

/**
 * Compute each member's net balance from a list of expenses.
 *
 * @param {Array<{amount:number, paidBy:string, splits:Array<{memberId:string, weight:number}>}>} expenses
 * @returns {Map<string, number>} memberId -> net balance (positive = is owed money)
 */
export function computeBalances(expenses) {
  const balances = new Map();
  const add = (id, amt) => balances.set(id, round((balances.get(id) ?? 0) + amt));

  for (const exp of expenses) {
    const splits = exp.splits ?? [];
    const totalWeight = splits.reduce((s, x) => s + (x.weight || 0), 0);
    // Payer fronted the whole amount.
    add(exp.paidBy, exp.amount);
    if (totalWeight <= 0) continue;
    // Each participant owes their weighted share.
    for (const s of splits) {
      const owed = (exp.amount * (s.weight || 0)) / totalWeight;
      add(s.memberId, -owed);
    }
  }
  return balances;
}

/**
 * Turn net balances into a minimal-ish set of "who pays whom" transfers
 * using a greedy creditor/debtor matching.
 *
 * @param {Map<string, number>} balances
 * @returns {Array<{from:string, to:string, amount:number}>}
 */
export function settle(balances) {
  const creditors = [];
  const debtors = [];
  for (const [id, bal] of balances) {
    if (bal > 0.005) creditors.push({ id, amt: bal });
    else if (bal < -0.005) debtors.push({ id, amt: -bal });
  }
  // Largest first keeps the transfer count low.
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay > 0.005) {
      transfers.push({ from: debtors[i].id, to: creditors[j].id, amount: round(pay) });
    }
    debtors[i].amt = round(debtors[i].amt - pay);
    creditors[j].amt = round(creditors[j].amt - pay);
    if (debtors[i].amt <= 0.005) i++;
    if (creditors[j].amt <= 0.005) j++;
  }
  return transfers;
}
