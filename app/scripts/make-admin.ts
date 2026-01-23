import prisma from "./prisma";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx ts-node app/scripts/make-admin.ts you@email.com");
  process.exit(1);
}

async function main() {
  const user = await prisma.user.findFirst({ where: { email } });

  if (!user) {
    console.error("User not found:", email);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { isAdmin: true },
  });

  console.log("✅ Admin enabled:", user.email, user.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
