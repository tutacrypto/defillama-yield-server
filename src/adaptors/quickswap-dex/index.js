const { request, gql } = require('graphql-request');
const utils = require('../utils');

const url = 'https://api.thegraph.com/subgraphs/name/sameepsi/quickswap06';

const query = gql`
  {
    pairs(first: 1000, orderBy: trackedReserveETH, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      volumeUSD
      reserve0
      reserve1
      token0 {
        symbol
        id
      }
      token1 {
        symbol
        id
      }
    }
  }
`;

const queryPrior = gql`
  {
    pairs (first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id 
      volumeUSD 
    }
  }
`;

const buildPool = (entry, chainString) => {
  const symbol = utils.formatSymbol(
    `${entry.token0.symbol}-${entry.token1.symbol}`
  );

  const newObj = {
    pool: entry.id,
    chain: utils.formatChain(chainString),
    project: 'quickswap-dex',
    symbol,
    tvlUsd: entry.totalValueLockedUSD,
    apyBase: entry.apy1d,
    apyBase7d: entry.apy7d,
    underlyingTokens: [entry.token0.id, entry.token1.id],
    volumeUsd1d: entry.volumeUSD1d,
    volumeUsd7d: entry.volumeUSD7d,
  };

  return newObj;
};

const topLvl = async (chainString, timestamp, url, version) => {
  const sushiPolygon =
    'https://api.thegraph.com/subgraphs/name/sushiswap/matic-exchange';
  const [block, blockPrior] = await utils.getBlocks(
    chainString,
    timestamp,
    // this is a hack, cause the above url has the wrong prefix so we cannot use it
    // note(!) not sure if i should keep this, or just remove quickswap from timetravel
    [sushiPolygon]
  );

  const [_, blockPrior7d] = await utils.getBlocks(
    chainString,
    timestamp,
    [sushiPolygon],
    604800
  );

  // pull data
  let data = (await request(url, query.replace('<PLACEHOLDER>', block))).pairs;

  // pull 24h offset data to calculate fees from swap volume
  const dataPrior = (
    await request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior))
  ).pairs;

  // 7d offset
  const dataPrior7d = (
    await request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior7d))
  ).pairs;

  // calculate tvl
  data = await utils.tvl(data, chainString);

  // calculate apy
  data = data.map((el) => utils.apy(el, dataPrior, dataPrior7d, version));

  // build pool objects
  data = data.map((el) => buildPool(el, chainString));

  return data;
};

const main = async (timestamp = null) => {
  const data = await Promise.all([topLvl('polygon', timestamp, url, 'v2')]);
  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: true,
  apy: main,
  url: 'https://quickswap.exchange/#/pool',
};
