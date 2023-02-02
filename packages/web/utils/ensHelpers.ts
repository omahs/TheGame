import { CONFIG } from 'config';
import { ethers } from 'ethers';

const { mainnetRPC } = CONFIG;

const mainnetProvider = new ethers.providers.JsonRpcProvider(mainnetRPC);

export const getAddressFromName = async (ens: string) => {
  const address = await mainnetProvider.resolveName(ens);
  return address?.length === 42 ? address : ens;
};

export const getNameFromAddress = async (address: string) => {
  const name = await mainnetProvider.lookupAddress(address);
  return name || address;
};
