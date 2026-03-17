export default defineEventHandler(async (event) => {
  // In a real app, this would query a database
  return [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
  ];
});
