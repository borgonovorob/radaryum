export const COUNTRY_PATTERNS = [
  ["Mexico", /\bmexico\b|quer[eé]taro|monterrey|nuevo le[oó]n|tijuana|ciudad ju[aá]rez|guanajuato|san luis potos[ií]|puebla/i],
  ["United States", /\bunited states\b|\bu\.s\.\b|\busa\b|texas|california|ohio|michigan|north carolina|south carolina|tennessee|georgia/i],
  ["Canada", /\bcanada\b|ontario|qu[eé]bec|alberta/i],
  ["Germany", /\bgermany\b|bavaria|baden-w[uü]rttemberg|saxony/i],
  ["France", /\bfrance\b|nouvelle-aquitaine|hauts-de-france/i],
  ["Italy", /\bitaly\b|lombardy|piemont|emilia-romagna|veneto/i],
  ["Romania", /\bromania\b|bucharest|bac[aă]u|cluj|timi[sș]oara/i],
  ["Poland", /\bpoland\b|warsaw|wroc[lł]aw|katowice/i],
  ["United Kingdom", /\bunited kingdom\b|\buk\b|england|scotland|wales/i],
  ["China", /\bchina\b|shanghai|shenzhen|suzhou|guangdong|jiangsu/i],
  ["India", /\bindia\b|pune|chennai|bangalore|bengaluru|gujarat/i]
];

export function detectCountry(text) {
  for (const [country, pattern] of COUNTRY_PATTERNS) {
    if (pattern.test(text)) return country;
  }
  return "Other / undetected";
}
