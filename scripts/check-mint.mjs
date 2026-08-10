import { createPublicClient, http } from "viem";

const publicClient = createPublicClient({
  transport: http("https://gensyn-testnet.g.alchemy.com/public"),
});

const TOKEN = "0x8A2d75753362Eb5D5669a2c22cbf394b26a0571F";
const MY_ADDRESS = "0x75a0c2d1df51c07982de3ff031e5232518676b19";

const ABI = [
  { type: "function", name: "ADMIN", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "recipient", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
];

const admin = await publicClient.readContract({
  address: TOKEN,
  abi: ABI,
  functionName: "ADMIN",
});
console.log("Token ADMIN address:", admin);
console.log("Is my wallet the admin?", admin.toLowerCase() === MY_ADDRESS.toLowerCase());

try {
  await publicClient.simulateContract({
    address: TOKEN,
    abi: ABI,
    functionName: "mint",
    args: [MY_ADDRESS, 1000000n],
    account: MY_ADDRESS,
  });
  console.log("mint() simulation SUCCEEDED - it would work");
} catch (err) {
  console.log("mint() simulation FAILED:", err.shortMessage || err.message);
}
