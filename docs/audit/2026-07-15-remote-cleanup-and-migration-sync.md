# 2026-07-15 — Remote cleanup + migration sync (117 → 124)

**Ruling authority:** CHiP (owner), 2026-07-15 rulings — payment, rental-booking,
sale-order, and message domains confirmed owner test data; extended by explicit
rulings to official documents (Pass 2.5) and the KYC domain (Pass 5).

**Scope:** 856 rows across 41 tables + 13 storage objects, deleted table-by-table
with per-table interactive approval, exact-count assertion, captured ID lists, and
verified-to-zero after each delete. Dry-run performed on all four storage buckets
before deletion; zero orphan objects found.

**Guard-lifts (both SQL-gated before execution):**
- #1 `prevent_rental_held_balance_event_delete` (migration 086) — dropped inside a
  single count-asserted transaction (executed by CHiP via psql), 231 rows deleted
  (held-balance ledger + booking chain), trigger re-created VERBATIM from 086 and
  probe-verified to bite again (dummy-booking insert→delete→rollback probe).
- #2 `trg_kyc_document_access_log_no_mutate` (migration 109) — route atomicity of
  `supabase db query --linked` proven empirically first (DROP + forced error →
  trigger still present), then 16 KYC rows deleted in one atomic submission,
  trigger re-created VERBATIM from 109 and probe-verified.

**Final state:** migrations 118–124 applied to remote (one transaction per
migration via `supabase db push --linked`), per-migration post-apply verification
passed (guards / functions / index / column / constraints), `supabase migration
list --linked`: local = remote at 124, zero pending, zero drift. Database password
rotated by owner after an in-transcript exposure during this session.

---

# Remote cleanup audit — 2026-07-15 — project yzjczvzwmbbeyoodrjwm (CHiP-confirmed test data)
## payment_alerts
before=21 deleted=21 after=0
ids: a44746d3-eaa9-4b18-be6d-336d713e341a, 1e994b24-991a-4501-883b-994497e64a3d, 0757ccd0-9a4d-425c-a199-e483dd11431a, 1510ca0e-39b7-4c01-ba32-8da5c7b13e74, 088a3b86-4a5b-42c7-829a-6a5df82176a7, cae08512-5fad-4391-9a77-b7bc9ec78dc9, 6863af0a-bac9-4bde-a300-4e8ceb57c15e, 9cfd7195-4034-4fb4-a62d-3ed322f7685f, 98996a8d-9e0c-4299-adbd-4a628ed477ae, cdff2b81-ba70-44fc-b0eb-bd89678a79bc, 3ba75bee-d28d-4e87-92c5-2d54ef9966a6, ed7e9388-f7da-4714-a303-9fbd0a71e441, 73266d5f-048b-4f2b-8e38-eb4ea1c14468, e744a62c-7ba0-4cda-8de6-0d320f5202d2, 2cad5e3f-1279-491d-bdab-0bf63e5733fa, 0a8e94a2-ed2f-4364-9cb9-e07f34dab78f, e4f9aff6-6305-4481-9c4d-293a94a192ef, 55c1ddcb-7b67-479e-88c6-95635d2f5d4a, 0e0d34ec-a5af-4c8c-9fb4-0adf6369f68e, c5afc658-dd20-4f2c-b6e6-0753d23c356e, fdd99555-d770-44c6-b769-ef0d98ae0203

## payment_refunds
before=5 deleted=5 after=0
ids: 7071af14-01c8-4fe9-b352-46fcdb61ece1, f6901b7f-b236-421d-87d8-5c1e4d6d3b16, 0fb59b74-888f-4208-8fb7-4bc3f3f57a31, aaadfbec-2217-46a9-8f79-2353d458ddbd, 44f478c2-3bf0-41c0-8b2d-ee1e1e53625f

## financial_recognition_events
before=2 deleted=2 after=0
ids: 3239abdd-f61a-486b-94ce-e7f336561869, a2c89d4d-a624-4d27-82fd-6bec1576d78f

## rental_booking_deposit_disposition_events
before=2 deleted=2 after=0
ids: 76b951ae-c8b1-4adb-8051-fd22e4b1fb23, 4a28e002-3872-462c-af7d-b1daffee629f

## rental_booking_deposit_agreements
before=1 deleted=1 after=0
ids: bbcdeeda-16d5-4129-803e-a0aa73af74a5

## pos_document_issuance_tasks
before=10 deleted=10 after=0
ids: 945d44ef-4a8f-4b06-af30-05b1a40d4638, f020db60-8440-42e2-aa72-e176bcf9c0c8, ebb1b1c7-9f26-4406-81f8-be9eaf99368b, 8870ae25-430c-457f-8ef6-ab8a3b500eaf, bfe35cdc-c3c5-47b8-834d-ddccfdd1db7c, 886e31ef-18ea-4196-a492-b2f32e8e9eae, d6af0b44-477f-4ad8-8f75-81601b302c55, 5fc80504-95e9-4b4d-8a84-9b6294b9aaec, 0b1fae5e-f92f-475a-9fb2-4f70b43dad05, 0a77698b-c619-41c7-a221-b1007a9cdce7

## manual_payment_request_slips
before=4 deleted=4 after=0
ids: 689de223-6860-418b-9b55-76dd6b0e0b60, f0e19695-af8c-4e22-ac04-4a18e3e3f60c, 0fff7fea-677b-4bf1-b11a-4a592dc13c2b, 0680af02-83ec-4648-88a2-2030d665bec6

## manual_payment_request_items
before=16 deleted=16 after=0
ids: 66ef7a94-6f7e-4a6d-aa13-2f52a7598b8b, 7ff7fb71-f2ac-4d4c-b3ce-f407e4dd4cbe, 970eebc6-6849-477b-a26e-780ee59ca6ff, db0b942d-bbc8-4e9c-a127-dc7893570d03, be6f6357-c4ec-4972-873a-6efe7452ab73, 35761c6b-64ec-4ead-8bcd-e2f129151b84, 0fbb6b31-bc05-4779-8fc1-bf0a0fe9d9d2, 8cd2aac1-a077-4e58-b783-fa915eb41578, 4840e004-c03f-450b-a993-f6f7b2b3f9ba, 8108c6c6-43ac-4ae5-b167-830c009af08d, 29085d33-72f7-4e84-b533-5f364754d8e4, 91a7429a-a575-4f8b-b74e-b5c4ace60531, 779698ac-84c5-42c5-a81e-d5fe0b15526c, dc7e7e8d-757c-4916-a64f-fbf949cd8e22, e80c5479-f6ae-43b5-a5ff-57a75b756466, 26d48dd9-b33b-4e9a-970c-b78b25e232ec

## manual_payment_requests
before=14 deleted=14 after=0
ids: dd680ad2-b7de-4247-8107-0e6699061200, 50c68582-fdf0-4d71-b9d1-0f62d62358d4, 1f1ff054-aad6-4f15-a78d-2c88ea8eb374, 26383583-fa66-4660-9f66-b7e413a66b0d, e2e24c2b-ad2f-4e59-95ca-9405df73214f, 1c6c4e0c-8b5b-4faa-8381-d27b5d49cdca, 9ddd8e36-ea1c-4496-9584-409892d86780, 7c4282fa-8fcb-4066-8e0c-334333bb829a, 61f763d8-5fe6-45ef-b110-4ee30c3b05fa, efaf9215-d1ce-4f72-92b6-e3500a728e9b, fb52f1ab-a7a5-448c-a263-07d241734d70, e5d1ade9-ae94-4daa-8529-4f7edc45c9db, 978a3d69-4e84-478c-bca5-45313f1bc437, f1d6aea1-437d-4b33-a917-e80e908894a5

## mixed_payment_allocations
before=54 deleted=54 after=0
ids: f8006282-2470-4ad2-b66a-ecb3641b6572, f7ff821e-b4a7-4a1c-840e-876f8b3f165f, fd370392-dd16-4f64-a2ce-6711dfa8a583, d1458507-a96d-4c1c-82b2-607613a87a75, 2f314f3f-f51f-464f-9201-f16e52ce4b2f, 2c8296cb-b8dd-4f72-ab19-f6a241ee74e7, 6a4c5876-b729-4b04-9766-9ddb0d976097, e98bbacb-6fe4-4309-8a6b-f518085a931e, 165544b5-6518-458d-bd59-8b91766f6885, 34050aec-d7d0-48d6-86f3-8977e5905a3b, 953b1acf-dda6-4b09-8eb2-e6b882016dda, c76da4f4-2cd7-44ba-a3a0-9cf455935eb5, 99067b0a-5288-46de-a8c4-7ee1840c3246, 1a2e291b-40fe-4862-8dc3-a0695cfb68e5, d655032d-af99-4c17-9b95-4699b59f44c0, 76690bfc-d0a8-436f-b6f7-66a4380b1ec3, af993b1d-e103-4ece-a33e-684aa1e009ce, f3e98e85-b9e1-42ab-8816-094d799f9310, f90ef37a-c3bc-48e7-8a69-c0fc9e166d94, df155d92-e652-4089-98f3-e0d571774be7, bef1c4f7-5faa-4975-88e9-e181f75a82c1, 38e37793-12ef-40f1-9e6b-b675f855d237, 70c530be-d536-4fca-8ec4-91e20c1f045b, b12c6958-e28d-4d93-a772-9929902bacbb, e2fa1060-d3be-4ef7-9e03-7c172f44aa54, 2a4f44d2-b444-4eaf-9b6a-0afdca9ea0fb, 8687f4eb-b1c9-41f2-a57d-a7e283b7b34e, 06e48a16-9d7f-43c4-b760-49cfbe72f1fb, a0c44603-56f1-426b-bb8c-aae68f01ad48, 5a57d06a-5c01-459e-82fc-199032d45036, cc90f7eb-5217-41dc-be67-44887a81d456, ed096c61-ef66-4607-9d76-55c0d8b5f622, 32ed3bf2-3269-4ef3-a56f-0336c5ff2e26, e2e5ba83-3a74-41b2-80cb-9fa679a0b684, cb0ccd71-fcdb-45d6-b9fb-1011586d8993, d89e5632-8d97-40bb-90a6-8e4d749d6892, a87f291a-4a8e-45a5-a74e-3b5a2603f0b3, 92a62e72-3abb-43d3-b034-803a7224299c, 7e0f9444-efe3-46c6-84ec-7aaf9a993eb2, 97f0a248-0320-4e6b-9c25-ca6a53f5d37e, e2e519ed-6026-4f8a-a6c0-6d7b344ce986, 0c585ff9-79da-49ab-a0bb-d19e455c78f4, c5336961-1ae0-44f6-a711-e21ef35b1bca, aab4f703-dc8e-4bd1-bb37-b62ed34a0a35, 280a3e73-b389-479a-abb4-461000f8456a, 7cf000e6-bdf1-4818-ba18-f9eef2451362, af83c80a-40d8-4345-9ee0-a4394d0bd508, e8a19581-8387-4751-b8d3-c87c08ef260b, d1489aa7-f30e-4e65-8bf7-7d7be0be430c, 5fbb83c1-8568-419f-945e-a064e4e115c9, 940f716e-e6eb-4126-98bb-d68b5b80ed03, a6a408b4-600f-4e14-92e0-80247d9384f2, 7df4c885-0a23-458e-a9fe-cc7b881c5478, 69813731-6772-4416-84c0-197acaa7bcdd

## order_items
before=85 deleted=85 after=0
ids: ec50d0d2-179d-4fa8-b9ac-dfd096c7c4c5, d53142a1-fb9a-4e29-bc49-65003d5d8d35, 2535966b-b8e9-44dc-ad61-48079a1c7213, ad45cdd8-1b63-4e2c-8140-777bd46a0b38, 7af19775-113c-435e-9807-4c8523d0670e, 8c8007f2-91c5-4e6b-beb2-414dccfaf733, 08ac9ae4-3c4f-467c-936f-ee9665b6ad4e, 599aeff6-45be-4827-98de-7f14c0b08fd7, 6d6b6eea-c33f-42d0-8c9a-dd177d6d4062, a4b6644d-dd33-45fe-9c0a-7931d92fcf25, df46ae1f-f9a3-4f9b-a934-97fe9449b6db, 55dcac94-c2d2-4284-99a5-dce3cf705c2b, 392cf01d-3aa1-498a-b082-c26e4a722e86, e6109a89-e7d1-4fd3-bead-7c85f3c93943, 7388bd5f-0706-475b-aaa1-8ab36f519321, 4b21452c-956c-4e98-934b-31a4a0a77d3a, a9b9194f-fe0c-4e96-af2d-02adc570dfa7, 836f80c4-f2d6-4ff8-8d7b-26e1b0e3fd03, 568b1ca6-644b-40dd-b1c9-30709ebdd3a2, b6da7ce0-58b1-4d90-8320-fa5c562d5606, 6eccef30-91aa-4a70-9628-31a58487468e, 8c0b91d8-9eac-4a42-9a61-02465fdff1f3, b267b377-ff0c-4605-ad73-8a661892d992, 77cdbe63-513e-4d49-889d-1c22abc55e5c, 2a1ce72f-cbd5-4b64-a376-6fb61a38c90d, 463c2ca5-be85-4c74-98b4-6bcc47d25d2c, fd0c2277-09fb-4933-a0ed-80da4efc3733, 61d9c38d-2a35-43f5-9aab-9d8f5407322a, 5fe5d8d9-7739-4611-b906-8190361b5e7c, 3a7d0c3e-8cad-4d3b-b80b-64a59ef83a91, 75f43b00-4d8e-4e7e-b03b-b7f850b5f7b7, b9ffb02a-9ce2-4b9e-92c7-b7e1d46e8add, fbd95f2d-7fd7-496e-a31a-0aa6cb816dd3, 31617b30-7c27-4711-9562-93bf5ddf6ac4, 2f4a3372-5808-43a7-90ae-02197a490cf2, 73a19554-c064-4216-afe1-9f450d7aba87, 45d6d57b-9a4d-4d8b-a718-61810ca65025, 31dcfbdf-ba91-45a5-ae63-dbd4d0760b66, 9f079ae2-9e74-4021-8e46-5ea9145e1722, 73511811-059b-4379-b310-7a8f6d3787df, 2f2d0cdb-6ce7-452b-b43d-66b826e67e46, 5b7b48d2-8ddb-4562-ad07-7d7bcffb11be, 340d39f0-c005-463e-9078-d60c897bc34b, 467e6e3a-d2d5-4952-9f4a-35d1a2e5f5c1, 236a1834-6259-4c63-840e-53a05a3eaf5d, 88498d9b-d549-4d47-8e6e-6bc8dceeb90b, e1b44fb6-b923-4d5d-ae76-2cbe31e316aa, c49fbfbd-b1c5-48ea-94c2-76fca4df369c, af1e66f0-0063-4528-8d82-2b49637b9d6f, 59dd3f5c-4bbb-4e22-8e28-6a00af9c1b70, 79ec0352-0895-48ce-9d44-7cf65c5bddbf, 4070910b-4f51-4b0d-b26d-b73acb2cb761, 94f3c50b-08f8-4049-8290-515e631fe1f7, 7a885090-cf8e-46a1-afb5-177e91285cf1, a10f66f6-885d-4f79-b6c4-b5c1ede290f4, ea745ec3-7e70-4a7b-b8c2-7b7fe3c9bc37, 38c4e90a-ed64-46f0-9d2b-7e94f7d98c96, cc28e6e3-8569-4df0-b7de-401d8e238297, 5fc14260-e001-498a-a817-17aea045eb41, 10b95e52-2acb-42fc-869d-f5506570548c, 0facc3fc-86b6-4284-b8d7-353b1c00c454, 4f27ab50-c575-4ebb-80ac-757f6652b709, 5ec8b98c-659b-4238-b6e8-f15a9fcd683e, 0bb466df-21d8-46ca-a10a-ff8300d80239, 4dd23760-2238-4134-b8bc-4700cb55e07f, a765a311-f7ed-40bd-919d-d7491a02d9a6, d6ef6faa-c3ed-4eba-a598-86edaad0a7fa, 213f54fc-4049-46e0-9ece-83cc68f3616e, 6a769c98-5385-4c38-9fab-4106380cb887, ca256428-a126-4ec7-a763-8b9fc11f413a, aa75ad05-63c6-4755-9c5d-bd90d737cc62, 8a0489ad-ea74-4d33-8828-71a8ac55aeff, 5af07a33-72ea-48f7-8a29-8c6e2217ed44, cf8ec129-d62b-481d-aecd-5f3159984c23, c88218ae-0790-49e4-9c75-b235de779cd7, 8d5ddde9-dba3-49aa-8e73-b99e1f4f2731, eeb8dfdb-3dd9-411d-8d1e-0405cc022373, 1fb12152-2dda-43fc-a30b-6171902662cc, a0f5b1d1-1b7b-497f-b903-49aced42f886, e1fa9337-eb12-4b04-9c4e-5f9ef9874c60, 27fb3fd5-0c47-4c8a-9b46-40c2c516de0b, af0bb1dc-f109-478b-ac9d-956bde35c46b, 27aae8f9-8192-4a24-bf27-0c2f2ebac10b, 5cfdc53b-3498-4a43-bc1f-c899c59a1201, d0f6de1e-5db5-433d-b15d-dc855e0774f5

## order_idempotency_keys
before=52 deleted=52 after=0
ids: efb8d288-f3b2-4fc5-ae84-399396aaa16e, ccd817e6-9845-4833-95ff-fd8d2e8bd13c, 88f33935-eed0-48ce-9411-ec13cc24092b, 357e7b90-91b2-4cbb-949d-b157f9bf4c76, e224c4e9-7d26-4f05-8a5d-925cc4a204c7, 5599b048-3be1-4a93-8be5-5891b53827fe, a2ffb24d-4f2c-4694-ae3a-b92420bb4ab6, 0e4571dd-432c-43df-acb1-526122f92434, 36cf62ad-7944-4fe5-a344-a5ce0238c6c7, 87926750-675c-47c1-b9c4-ee911a9e83c9, e978034a-1f9d-4e6e-8e13-8c8c14292c74, e12508e4-a240-4078-8bc3-80913623a031, 9fb5b24a-0ec5-4905-b382-71d7a9442e1a, 2b1e17f9-b8d8-40fd-97ce-48a2e97699a2, 6262c7ca-a347-49a8-9e66-15c55ddb1cc4, 5f71e8ff-d8db-477b-a10d-915e1c26bf9a, 13505e37-ccc0-491b-818e-b6fab0b75e2a, 9a7a10e5-8dd1-4c20-92ca-1e67d4e24776, c0edc862-e1b6-417a-9f04-899f39cda70f, 1bc9ba01-bb71-445b-8ef3-87208279ca1d, 77d297b7-8f99-45c4-a27d-76e7103a1cb4, bdf699cc-1c78-4ef0-bbb4-3794987f5551, 15f62eba-08a9-410e-9aba-2b8ddb4a7c57, a7fe723e-ede3-4965-a827-2f8b94279b54, d4c80ff4-d70b-4c78-94a9-48d94334b702, e182726d-b019-4d7a-a126-de1f24b45b56, b9369c9c-2183-4de9-9f4b-a099b8d3eae2, 8a60784f-9eba-4048-81bc-e48b71457fe2, 4766dc0b-4b64-4efb-a1bd-8411796d49a2, 35c12220-bfac-4c7d-8e19-a50372a4b218, bd1f9458-c35d-4dc9-8f77-3c17db2a101f, 2716f11c-45be-4f64-bbe7-00099482c603, f00a15a1-aa83-484a-8e60-f2b58667dc4d, 6be879bd-9c3f-4b94-8353-1ef320436ed7, 17d6ea41-2a50-4877-8b49-1ecab248958b, ffaf9fdd-a950-4d42-a636-05890f33748d, 9e694c0e-e235-4f0b-aff6-b8806ab4898d, 83f5680f-3b06-4a70-91bc-0b0c3e2018e4, cbf8367c-7ab8-4d1e-89ba-87f730f9923a, 0d66d552-ee3d-4c3a-8565-b4e9f4d148f6, d7cc7041-e7df-419e-8573-a9590c684732, 515a892e-5d67-47b4-9078-9c010b5c8870, 1a892c75-ae54-4a14-8606-41f21cb79f40, 405b138e-109c-48dc-97c2-04a626f97822, 4dda34cf-9c2c-46a2-8137-adac2ead47a3, 5fa56941-2e9b-4e47-a35a-f194e796e1a8, 78d7765a-4b29-4ebb-bf98-9adc5e47023d, d085bd98-f105-47c6-838c-e1570b7d6c5a, d559e7d5-cf8b-416e-b7ab-d8bfb4c5b3d0, 79a8430a-5860-4987-bfa8-b644f2cadfb5, 006a2865-b15e-4ac5-b454-7c6c4996e901, f4722b6d-6974-4f36-a04b-49a3c69bb75b

## payment_attempts
before=25 deleted=25 after=0
ids: 03588454-3cde-47c0-9e71-1660208f801e, e18d5032-baf6-48bc-bf45-f49de230d70d, 60454661-bcf5-44e5-95f6-4b8466fcfcf7, 86414a4d-99d7-425e-b845-e47bc1e2ac03, e5150b9b-aedf-4f47-91fa-312adef95175, 6c748847-a6ca-4cf9-bb6d-c160b98c720b, 6c9e28ec-185f-40c7-9911-e2d977a70c5b, 822d6b18-9d94-48a6-9667-a0493c6ecbf7, 7f912e46-c4af-4a7a-80f5-1cd880515cbb, 1752786f-3ae0-4473-8561-45b18261cb12, edb3af37-13c8-4f7d-a581-85fa59fdb1b8, bdee773f-9c74-43c1-a0f1-e13c5844f5f4, 086778ff-41fb-49b0-bde8-2f57c55e3f17, 4a46cc30-4a69-413a-9008-4fa0f8b076a0, 1b606a68-5b5b-439f-b5c5-fc621ae71703, e47acd7a-8140-4faf-867e-ee10b80f603c, fe7e96c7-aa19-41c0-be9c-edc378efae6c, 7c7682ff-215c-4036-bef3-772871b0c0e2, 14953b7c-293a-4dd7-84c4-a80e49bb0200, fc6b4fc6-27ac-454b-bfab-329bead6b62e, d9f54c97-c1fc-4967-84a4-9b7d5dc972da, a336c559-c04a-4689-a8a4-2390fc72feed, 388088bd-7fef-49f0-9397-65ef1fb6a82d, fe2cfd73-6017-471d-99c0-6d297570f645, c1964b6d-43d3-4ba9-a400-1bcd2d0a1540

## mixed_payment_attempts
before=40 deleted=40 after=0
ids: 74a193ff-d3b4-46b3-9987-0ed80e0908c1, f22175d8-0800-4db1-8ef5-742512cc3c6a, 7b44d4f0-2c49-4a11-9527-4b397a0c80c9, 94322453-a5e4-4e7a-8af2-2a49f1c3a804, 010bf0b4-ea26-4e19-a80a-628c2d6ca2fc, 553723fe-77ce-460f-8d69-5b9f8262876d, 5fe02659-3922-40cf-a739-cfcc302d850b, e6e4df00-d16d-40c7-817a-7160b92aaf7b, 0e573ab7-48de-4d7f-89f1-88a05d7684b6, dcd33345-ce6e-49c6-968d-4defaa0431cb, df79c4a0-c48d-4fa4-a426-b845d6633f4b, ddfebea3-4777-4f5e-a6cf-b72775b6e426, 9e4af853-6e82-4fd6-8674-d7b1b6d5bb04, d92f1964-d2f1-4b91-af78-242f7de6718e, 5afaaf99-6e36-4210-a1d0-ca89f4b48a92, c8cb274a-8d72-4b21-b280-d23dcccfd772, 161bd649-a3cb-4a07-a4cb-fd7812e85c01, 68e4e494-7517-417f-b551-68a5890bfcf9, c690d681-0a9c-4482-ab8d-3e9216bb9f09, 4c642a0e-0fed-4721-b2ae-4a210d858b2f, cda25643-36bb-4d26-a14e-44d6abd233e8, 850b505c-1817-4d2e-8b8c-1f06fcbaaf7a, 91b71dd6-bdc7-4c25-82e0-d3c367d2770a, b2b5fb87-3ec4-4c12-9c11-0ec29a81d14d, fc5ce37c-6c01-4b28-a633-3cc7fda66134, 716172a2-cffb-47d7-8225-1f0b135873e0, ae98b840-2b8a-4145-9561-751249e88d22, b8729aff-88f7-4a62-987c-15a00d68f0e4, 0ceb2110-5e85-475e-a775-ccc6536761ff, 647a00b0-07df-41eb-bd17-2d7142dfb540, 92396f9d-4560-482a-a34b-1ba25c9fca5f, be80f947-5f82-41da-9b0f-81568e29be44, 30eb6413-c3f5-47c7-996b-4fa9c81408c8, 0b5ba2de-ee4b-4b4d-a0ff-c4617b131b57, 2e885d7f-7465-4d77-882c-9ae6100c915a, 0e130f65-676d-4537-9278-3b79f8e4e0de, 2178516b-cb75-43f6-8209-c0db1566de0b, 4adb5a84-6bbf-4e32-92fe-cd4f57be31da, d949de24-e1f3-49f1-8e8e-ae83668ebf97, 08199abf-83a9-4804-a4a2-f4f0ac35bda7

## mixed_checkout_sessions
before=40 deleted=40 after=0
ids: a5aba18b-58bb-40a0-9666-70c079813f23, a6d0a217-5ac5-443f-a019-a729e7f46caa, 15d0e3de-7465-4626-bbaa-e1fdbf922b1f, 1ff20e9f-9de9-4eca-ad6b-eecb39e145a8, 1ffa0571-0ccb-47c4-aa4a-9769b8bf4c7f, f8b471eb-7412-4574-908a-31c0021a1fdf, 35e9f6c5-9028-4b4e-ba53-4e02a7737dcd, 4459a675-397b-41a9-b0cb-7e9c0816257a, 461aad6c-2c91-4dbb-b265-758eb0f2b083, 68585564-bc6f-4584-acd1-db481cc8670f, ef208ab2-1d98-4526-adff-0eeb025542b6, 3767c52f-bc66-4e1c-ba0c-06251685f0d1, acc60c7e-126a-4363-bb7c-aab88ec2bbd9, a61947cb-e3a1-48ef-90f5-2df58ca3ba9d, d0084ec8-cdf9-4a6a-90b3-e6a3b5a2fed4, 8b9db1ab-7118-496f-9805-9087b9dc979b, 2e4c846d-1abd-4d55-ae6b-b7a5d9f230ac, 507a5e36-d5d7-44ff-a31c-c37a2e7bb445, 31b59f8e-fc00-4384-af6a-e1b3cb2a7a5c, 01b2fb86-aa42-4e00-9bf3-cbb34bdac947, 8299e81c-3ea4-49c9-81e4-026cecc8dad4, 2d294441-6d84-4ca5-8333-1df59aeaf1f9, d8e40ccd-d499-46a6-8e02-beb79bcb5799, 2900e0c5-be06-48f4-82eb-9b5b912a012d, aee1ba82-e883-4364-b73c-bc5214c9629d, 4f2b15f6-9581-4380-ada5-02e5f1a358fc, 4df9266b-60cd-4afd-8113-80d4373a9a61, 43ab3b60-85d8-447a-a41d-5bce382af08e, 34a3bf87-395a-48ef-894a-cc6c3c39b4ba, 8d9ca837-7ef0-4cb9-8161-9befc636fc3c, 9e9ac0f9-6978-45b6-a144-0161554a43c0, cccfd31e-4199-49d9-bd27-ee7168302f83, e9063933-72f5-4366-9525-9089ea1c6429, d76036a4-a197-4ae2-8591-256f7d8cd070, 5e03e5b3-59d2-4b6e-9377-3e4a1761de03, b2a4d7ac-8fd0-4f3b-a348-c5d1acc892d8, 4af170b2-4567-48c9-b75c-b8f490ed4923, bde36d78-128f-40dd-9a6f-42fafa091d08, 71c96d5f-e130-48ae-b828-8c5f514e4888, f8f7a98f-014f-4898-bf38-fbac4998f8f2

## orders
before=80 deleted=80 after=0
ids: 0f446e38-a789-4a49-b5d5-173d3cb994bd, a76db24c-4da8-4172-b1cc-e5553a5c15d3, 08c9b489-3693-4c26-b8a2-5ebbff4e00dd, 6ea20593-1fae-4aa4-addf-b81d2bd1797f, 78c1b75e-f899-4e30-81e0-4c9951f3cdbc, 73f7e0e1-db97-49cf-a07e-b6d97a3dcbfa, 32b4de10-bf4b-4f3d-9c90-c479c464c649, a6f38a6d-4a19-45ab-a165-7d34f58a7415, 79ab5777-7138-4cb4-8a5f-2ee7d5f0c4c8, 7507f7ff-fb92-458b-9c2c-cb9f738e921e, 6f8f00c6-4e36-4566-a0d5-ea8a2ff98e08, 29323e78-2fd7-447f-b163-de5681857d9c, 6ff41f6d-79fe-47ed-9c1c-5fcaeea87395, db843210-e419-4972-96c8-5c8734364a13, fe9f4d33-d652-4576-9cfd-2ff1600043a2, cc5c96ac-9a7f-4b12-b38b-dfb18a8f5470, 12fb46a4-7d47-4a34-ab80-2473ed3b697b, 9218b18f-73c1-4c1b-8da8-afc9c211efc2, d782d3c1-923d-4be7-896b-8226e8143e86, 185ae9a1-b2bf-463a-9ffe-258242b346e7, 7c0c7b40-3d6c-4039-b166-ac05fb1d2038, d0e6948e-a3fb-424f-97ee-a6c31fa34468, c0ffa30e-42db-4080-8d1b-8a26ee38a57a, a0746eea-3d31-4163-815c-ab8c96a78515, 8d80d2ce-796f-41d3-936a-d5f85ae0a7f3, a4cfaac6-513a-4263-bad6-6863876c4852, bdf8d9f1-000d-499c-891d-8f8a00004a3c, ede7305f-2a5f-4203-ab50-cf8505b05a32, d5965e7e-6bdd-47ce-9bcd-2ac8018f20cf, 2b3da48a-5224-4664-be87-be7a25d0858a, 70954ef8-37ac-4c5d-9fe2-14dc90a6a9aa, 1f1414bb-b10f-4a0f-8e6a-11a288ff8c78, a19a99e6-f912-445b-ae03-7c21c76c10ad, ba15ba91-d67f-4c05-b8c7-eb0930206f75, b3187f3a-151f-44c0-982c-5fa21b60b652, 78c259b5-e8d5-4590-8ef0-24a09b91c764, efd405d6-06cd-4aba-8fa9-7d5c616cf840, b916a8ef-bb59-4baa-bbfb-c421ba265a5a, de52534d-d565-40c8-97ba-c91babad699e, 399a52ff-7eef-4fa9-b1bc-807cc172500a, d1f2f3b4-4c41-413d-ae3d-42e0ab3e5c0a, 18b34090-32d4-405a-8527-8ef29eeef89b, ed00d74b-f70a-46f0-9055-ad5e6328755c, 0ac47855-9ea5-4763-82a0-523bbe76df31, f8d881a5-ab14-4743-bc60-7067a34d682c, 120162a4-9a28-47e8-890d-62708b233539, 909ad288-2f68-4de7-8c36-902f60016868, 739681b1-583c-4d20-ba1b-c52cb7d6bdd6, 22c9c55c-e283-4e32-b725-5c0673d00aba, 8567ac49-f553-4f79-a658-c2df3daa4635, 7cf22385-c9d6-4f25-8fec-1f993ef3eaa8, ec84e842-9e04-478a-8d25-fac61f459ef6, b215e5ab-33de-4557-8c25-ee508cb67619, c2ecebe8-7e58-4b61-914b-84d1a42021bf, 2723faf2-794b-4d25-8fa3-48a6a5e1c337, 6a0a0405-728f-4c5d-a6d2-910a6f767388, e02d6721-0c62-415b-80ea-378522156a76, 3fa98389-e7a7-4e9e-89df-d32a54373132, dee93506-ecbd-40b0-9fbc-75622137a16c, 6560ffdc-a353-4164-be53-ab670d9f00aa, 9453d3b2-0d32-48f4-94a3-cfa5a7288d5a, 0bb7d56f-74bd-4d27-88ba-d6f51c6cb59d, 409e60ab-372a-4344-ae16-d77824a620b2, e0ef6f7f-febd-4ca3-a293-44dcdbdcbdc5, 3ff193ff-d588-4d79-a984-c50f29bc4625, ceeab600-7112-4249-bdd6-e5829294fa66, 774ccbb7-9d07-4039-a6f8-53ec2ac94038, 14a5bf32-f868-4750-9367-410f8b60a5d3, 35a47c65-16e3-4241-a7eb-653f25e6ca74, af25bf0f-a2af-4eb1-a266-c630334a2ed6, 7cb0adc4-595c-4f5f-a319-4940a4b43bdd, b249246a-5e31-46ee-bcd6-05e8d4cbf56b, 23a1b5d7-e446-4717-93a0-8cd6a7e792ef, 692f071e-f519-4892-85c5-408ec8bd7719, 214cc395-d177-432f-b4ec-4704e140c83b, 72f03779-ccbe-43e5-956e-3819e32c603a, 68d99ee0-a6ea-4461-ae4b-7f1a56ccda01, 77ebede6-ec5e-4d41-9665-2af6813b5eef, 639a94ec-fe25-4dc8-99a0-3a00c0f1bd25, b71daaf5-90bb-4f85-a4a8-92dfb64ea079

## document_events
before=33 deleted=33 after=0
ids: 7f96ea18-ec1d-44cd-9231-a532d12572ee, 2fc10951-c640-4b39-bec7-0ab5d892022d, 820b1447-0f95-4639-a07b-bb2308014c03, 082be98b-bdaa-465b-9042-e02c9c0a0ce1, b114e91e-910c-49c4-ba33-5043494e2e5f, 08e698f3-1688-4147-97fa-7392db67a50b, 8154c518-aadd-4037-9de2-3074d26ecbd3, c604428b-984b-421c-a07d-37e62cec8b38, 8073dd6f-95b3-49b0-b7af-1a6f469bfc40, df0b711e-4e1d-4d6d-a3d7-128f692b5a74, 221bfb26-ad82-47c1-a5fc-2ab90fbc2664, 69387691-000d-4351-bfb5-2e409eccaa93, ca1fabe4-44bc-4aa4-bc7d-0b5a52c6e43d, 645b7d8c-6589-4352-8491-ceecca71eb07, caccb0a7-e962-40d1-84fe-6da6da16b3e2, 377b9711-a98b-4561-a16e-6a56fd36c583, 6e71b4dd-87fc-421a-9e6e-5176a68373ce, b1edfa98-d714-4e5f-a194-3db961c32a53, 949f4dc8-4892-4c78-b645-16b0019ab432, 151bd150-bca5-4fbb-ad13-eca50353d0d2, 14b1e1a4-10b1-4169-bfa5-e8275c0d1c94, 78fd9416-d684-46b1-8e87-0f340673e9e1, 885d6fd7-16d3-48dd-9297-e67a33249c8b, 6e301f15-611b-41b6-aeb3-96e34386e2a9, 517fb19e-5557-473c-a984-8dc1bc787952, a6e7fd5a-bc08-4495-8dbf-37e6b5320128, 6e866fe0-5c4d-410d-b4c1-be8f3e240762, 0003612f-0f39-4296-b92d-920e266bb572, 2257a47b-5345-47d9-bdf3-16dacb9f3366, 85fd1b7d-bb12-43e5-8b37-6b6feac6d88d, e959bddb-0f38-433d-846a-e5547b922ded, 5eee9c7c-5d2a-4e80-bb8c-6d82b283d799, 65755d06-11fe-453e-8f90-bc41e4563210

## official_documents
before=34 deleted=34 after=0
ids: 2b101af1-96ea-4b0b-976c-c152f5dbf17f, b6acca12-a448-468e-9365-170f7d133e2f, 39ba054f-6c8e-407e-bf0b-9dcdcc010625, eb275f44-3cd3-4e99-8bd2-beea13be32a5, c29b3cc1-6154-439f-af92-355d14d515dc, 8951f068-c6f7-4f3b-b340-cbaccd6494f7, de40bceb-a8aa-42ab-b237-627aafab0a14, 0aeaa7ea-f83f-4958-8884-758530c010c5, 3f8c6fd0-762b-40ef-bd74-c93a006364c6, 82027cfe-0d1a-46cb-b935-83189547da69, 9acafdff-97a2-4a5e-b5f0-521a0763a94c, d6bb2f15-9e6a-4469-9aa7-8b47d5d76be3, b2a28ffe-4678-4d0e-9d2c-74c71a55d061, 3e5a60b6-398e-4b53-8b13-c7a8a455e116, 8c29df08-38da-469d-a1c9-3dc6a87faa33, aabbbad6-3719-42de-a946-d575b7ae9e2a, b6889bed-331e-4200-8a4b-ce5aba4857d4, 32123654-b31f-4677-a716-f35ee83db6aa, e7d08cbf-4043-46ae-8485-131a2c6daf8b, 22f79941-c425-471f-844d-450a61faa440, a7f7cacc-853c-451e-a969-402340da3ed0, c2515f4e-a284-4afe-8043-0cbf1862730d, 2eb4950c-e784-42ef-bc18-caedb2b3e45e, ee89b61e-0177-49ec-b83f-693ec7d93cdb, a4c1f1e5-2eed-43b0-b754-74a852223fbd, 3c7a9bfa-c17d-4340-a71b-e22e48bb4db2, 0fca976e-b288-4fa2-aba3-ee9883ea27b9, c380637b-b8ee-4ffa-aad4-32f5467dd58c, 4c66ef18-c24d-46c6-89bc-3a399ef7ed78, 902a0cca-1d4d-40b1-85a9-192405886190, 854b7e78-4a27-4594-8876-e8aef42ff37b, f8994f7b-97e8-45f7-9fa4-3ded982f2322, df81621b-86d6-4e92-9d91-0ecde4368009, aaeaaf12-17bd-454f-a0be-cd12ac3799fd

## rental_booking_deposit_action_logs
before=2 deleted=2 after=0
ids: 2cca83ff-f67a-49a3-93cb-a02ec50287ac, fabf0212-c932-44bd-9cb4-c680c90bf336

## rental_booking_deposit_proofs
before=7 deleted=7 after=0
ids: 7cd6750f-b177-49bc-8b3e-1c1669de5a46, 68f7e8ba-cbc5-4ea5-bebe-466d84a5ab4f, 33e8353b-62e9-4f7b-a883-5a3ac2e138ae, 0b9aa7b4-0082-4160-9d89-364c717318bd, 253c1619-d186-4ae3-8ac3-37aeb873ea31, 9d36bd06-4db9-442f-ab79-d4a5c6c02ab1, 374b2f17-0e03-4b84-8e80-b9948a2f85de

## rental_booking_fulfillments
before=11 deleted=11 after=0
ids: a46d72ad-61a3-432b-9522-45c9f1aafcf2, 81c089db-b403-496a-a022-d114821900c0, a461b27c-273c-47f3-a936-7b240040f418, b0a09bff-856b-4e94-959a-658364dcfc8e, fc414e4e-e623-4614-acfe-48ad71da563c, 3bfa4c33-e93a-4ff5-8d1b-9288a48502ca, 25884d31-a04e-48b5-b735-e06ad48b7525, 26c241b8-b243-432f-9c2a-580c7734f49d, f0a1ebc6-936e-4ec5-9674-d564b5268851, d75f26b7-c55e-4fcf-b982-906d91f11d5d, 17fbb9b5-d761-4bb0-8f53-b87ead6abaae

## rental_booking_checklist_items
before=41 deleted=41 after=0
ids: 9412f38b-d633-41e6-bf49-ce967e01175d, d47cb563-f363-4014-a566-b660fa850724, 3f29fc30-8ff5-45e0-8e66-77fd0640cf0d, 5c16cc95-430b-4788-ae65-797df418624c, 71d4382d-7db8-4808-bd7e-33567500e6ee, 40447da1-f4f4-4bc0-8a93-7ac10e569fd2, add9b6ef-526c-4259-b565-32fb86fc2f8a, a3578bbe-d31c-47bb-be48-14eb71fcf4d6, 9a1b4256-2d79-4fdc-a542-80083af77db2, 54d45c9e-8b76-438c-b330-0acc1f8a2ce1, d85b0f8d-ddbe-4053-b9df-0a38ead547a1, 82f543b8-1adc-451a-bca7-adb93710fe4b, 33665f05-b325-48e6-ac4f-79fac733b01e, 45d65c07-6456-4692-88cb-4da135a95182, 7028f8ce-12fc-4e26-a4d1-34655ddec4b5, ca9f9c5f-45ea-41be-b800-8b68084f4dae, 7b38f442-6ae1-4bd9-960f-2a7aca06a51a, c0dd3535-6a6e-4665-82a9-2277a870c3ba, dd0caf19-5f38-44aa-a326-35c9667f8445, 85cb78c7-3fe5-44a6-a459-f43c13527fa3, 8b8315c4-446f-49c0-a1de-68ec48458c38, fa734228-6bbf-4da1-92f9-c1c2d87fa1bb, 0e49a4f6-c045-4b69-afb1-fd4b54ff175f, 410fe609-f054-4f9c-ae3c-e46fdd9f9463, 3f460b01-164b-496d-9abf-8a583b8f5e76, b28137b9-75b6-4142-9bbc-015474da31d1, f434f83d-cc1d-4c13-8437-896176467c5c, de38c331-b7f4-4551-8be8-fbb4652129b7, c3ac9b74-fbed-48b5-a0f2-10a1245fe861, 874d3c05-37ab-477c-83f5-08a8fd0126ce, 9599962d-1b65-44b9-a9cd-ccae7c0a8162, b890ad51-61b9-471d-ac1e-0133ead6f156, e8a60b28-f79d-493f-a5e3-e0101769ade5, 2695ee1b-05f2-41cf-a7ae-19cfe54001b0, 6825676d-9a49-4b33-86d7-803f9debd1b7, fbf75e32-eb22-422d-a8e9-d103e4bb37a1, d0467a74-556b-47d7-9c91-19f528b6c20c, 7a9b99c6-40f4-476f-a125-f65ce2cee617, 7937f74b-d759-48ae-accd-82bd2be07a85, 22f17421-f78f-48e1-a847-ae085a297f9a, b01b417d-8737-4666-8c74-1747b5ee5db3

## rental_booking_checklists
before=12 deleted=12 after=0
ids: 3c6ae32a-25b9-4b12-ad0d-ad091c8c6c0d, 5b96d64c-58d4-405b-9215-74c0a45c27e6, f3d7b501-0871-4ea1-953d-2c1e3368fa35, 91960e85-013b-4f5d-aa33-19f3d66cfca8, f0e27dbd-8c34-430a-a3c0-ebffce720692, ea0d2846-4672-4a2c-a667-5c1b62dab319, dd5223fe-70ff-45f2-92fc-aaa6efeee5f3, 746024eb-344d-4ea6-adfd-c5b62b309dce, 28bcbf8b-8fca-471e-b7af-e34bbb1e69e1, 6b7d5086-05cd-47e4-a011-23aa72ba63db, 8edbe8c9-183f-439f-b06a-76a4771699b4, 1a85533b-ab6a-403e-916e-7d0de5ecd007

## rental_booking_handover_items
before=5 deleted=5 after=0
ids: 0bdaa472-5676-4e48-be2e-162f59789a4a, daba64d0-c3dd-4488-9236-6221dc0c3d16, 0f2175a6-042f-4af5-a659-50d9ca497110, 7a61aa04-cfac-497b-b052-7f84c2476b6e, 369329e0-2287-4292-8f9e-1a4875d1bc06

## Guard-lift transaction (SQL-gated, executed by CHiP via psql, single txn)
Dropped prevent_rental_held_balance_event_delete → deleted:
rental_held_balance_events=24, rental_booking_payment_lines=92,
rental_booking_payment_attempts=1, pos_rental_payment_attempts=34,
rental_booking_cancellation_events=5, rental_booking_no_show_events=2,
rental_bookings=73 (231 rows) → trigger re-created verbatim from 086.
Verified via supabase db query --linked:
V1 both triggers present tgenabled=O · V2 guard-bite probe PASS (dummy-booking
route, DO-block subtransaction, counts 0/0 after) · V3 all Pass-3 tables = 0.
## chat_attachments
before=6 deleted=6 after=0
ids: 36475226-ba0b-4ade-ba2a-51695070f490, e3cee666-80b5-4904-a8f7-eec2028f34f0, b8c4e823-d5ed-4ec7-9594-87f45715a263, e8fa7cd2-6193-4329-82d3-b47d596e7a3c, e87b8547-bcae-4035-93e5-2150b8b3da9b, c65fceff-6bf0-48d2-9795-25bc7d1dfa6e

## chat_messages
before=73 deleted=73 after=0
ids: d3034d12-9869-4ad2-82a7-e0ca06a93cf6, eb19807f-94f2-4779-97a7-3a5013785c47, 9c024e9b-b34f-4f7d-a830-1af74c7f963c, ce6f45ba-e21e-4090-b911-cd10c58faa6d, 0df71693-e03b-444f-a1c5-4fc24f8d4ee8, 318d6420-b978-4f26-841b-042bcfda1d61, 67399c5f-f9f8-4c01-871b-5d5dcc0842b8, 6ac6ef78-2046-4e48-8f29-006ecc984e4a, 2fb152bd-b0f3-4f4c-a0c7-5a55dd7dcd41, bda5583e-3763-447e-9533-c7523d6a639e, 94b853f6-fb16-4157-ae69-f339a164e1b5, 9e8727a2-9ba0-40d0-9431-9b05d7ad1655, 2b5b5842-b7d0-4ff6-8f81-9b4d8f2cddfc, eba42c21-f673-4df6-a905-da8a34c466ac, 8611d8ee-81e2-4dde-bc7d-4a42a2dbb5e3, 2a12e74c-5914-43cd-b3d1-28649b5394c6, ca8e724e-67a0-4b64-9606-fe66d0bcf26b, 79f07307-c3e1-417c-8e58-fa0e197509a4, 3190fceb-5dd5-457d-a0f7-6319b1e15f86, 6460abf4-6321-4911-80db-cf08323423eb, ff20ea77-aac9-44dd-a372-8b692360024b, 1f113924-a3da-4812-b04a-de0a4e4a84ca, 2d8372d4-015a-4e2a-a47a-694ae06faec5, e22fe8c0-e0bd-4e30-85a7-9b5f7e79cb28, 86ec239a-a8ba-4373-a201-04538414c470, 21fe23b8-28e7-4e85-960c-b91810f174d2, 8c9a6072-4f43-4666-b621-62b9ca84b2af, a8ceed47-f5ef-46b6-b6a7-910fd0e83cfa, a1d30ea8-7ee2-4b1a-ba92-3d0f6e0e61f0, 2bce2c96-58cd-4c5a-aa33-3ef43822e2f1, 23902407-d19b-40cd-85bb-419460003c7e, dea9c922-5873-4887-803d-b90f3b3593c9, 31e8d88a-b526-4f26-abc2-306bcb7b2aae, acfca420-a9bf-4272-9f7c-5ba3f98a7b25, da590d66-7dba-41a9-ad2a-d7c18cc0333a, 435cac0f-3497-4a40-aaa9-412b013b8ff0, b0c2a453-2610-477b-a994-ed9ee3567466, 571e9eff-5b1f-4b71-aabe-7dcea29f028c, 76deebf9-f8e5-4da6-b3e2-6f09cd9360c1, 9edf03f3-722c-4b06-b804-41253ffe23ec, 0d65d340-802d-4cde-bf75-d6510d508a1a, cbaacb27-2528-445c-8a76-be83c46a662c, d2a4229f-5d55-4bb7-867e-dacb0bed86f6, 90b7043b-a0c2-417e-9dfa-5b8d0926562f, 95428899-3d39-4690-8517-ce82c70b1140, 32d6712b-1982-4775-8bf7-a5fca718fc34, de8997a2-6851-4593-84f7-cceb4cef50ce, b5979b4f-0d8c-4464-95b5-b9e94f25c2c8, 74427321-c085-4b1f-b01d-acd420b5e928, efa24593-d187-4ea7-a5a4-d90d39394f7c, 207f7a3a-9d06-4457-acdc-172660dda3b5, 53f81b43-bd3e-4139-b0d7-bc296d970db0, 5b70aaaf-afaf-4cd9-90a9-25fc87952df0, 5ad176dc-1ff5-4513-91bd-bb8808f792b1, 562ea682-a7bf-4129-8a34-dfe796f1570a, 43a84415-bec8-4850-a8e0-d1a7340b1b32, df0fd523-673d-43c0-a5d3-378d58215e10, 2be18789-c1ec-4512-91b6-a1dc42de32ef, 5b3743b8-072e-4f74-b6c9-50e368b0cc82, 15efc6bf-5f4b-4a79-a3b2-926b17d8b3f6, 3ee670e9-db25-4469-80b5-fede2702efb1, 265baebb-55e2-4463-8030-b096634cfcf5, 95fdebf0-e89e-4c26-ae1e-0d204258c618, ba5178d2-f758-4686-9304-cf7a21ccc2e9, b29cda69-7037-4935-a212-503b09eff305, e5a58358-0206-4b0d-8c41-c7cbf1eeffe6, 3b4ab294-1991-4aec-9994-48a9097b9441, df157a1e-5672-4d48-97bd-eddc0d59e4e7, 2a40a3a3-8702-4ef6-928e-d787b49e587a, 18be1acf-5534-47b8-989b-46bc54060363, 00785645-c5b4-44a2-8b64-184ff191c183, e96df072-9178-475f-b474-50c116aa2a57, f6c15ace-69fb-4709-a0c1-4c37ac0db3a7

## chat_participants
before=11 deleted=11 after=0
ids: ('c1089c0e-d268-4c22-bee6-20c4c72b4b32', '8d67187c-33cc-4cf0-9d6f-082e67b97e5e'), ('c1089c0e-d268-4c22-bee6-20c4c72b4b32', '237d2cd5-e5a5-4fba-8c28-aef9bf89edc1'), ('6d5b3b5a-bea2-47f9-9d24-c480a2b023e2', 'de3c193f-01a8-47d1-8b4a-c54de0198706'), ('6d5b3b5a-bea2-47f9-9d24-c480a2b023e2', '8d67187c-33cc-4cf0-9d6f-082e67b97e5e'), ('c1089c0e-d268-4c22-bee6-20c4c72b4b32', 'de3c193f-01a8-47d1-8b4a-c54de0198706'), ('31fd8f73-589f-441a-bcb4-c412190b6081', '300325a1-59b2-4412-b4dd-47e9486fdaf7'), ('6d5b3b5a-bea2-47f9-9d24-c480a2b023e2', '237d2cd5-e5a5-4fba-8c28-aef9bf89edc1'), ('27a2f0f0-5239-40fe-b095-2bccd9762775', 'd158b51b-c041-4c12-930b-aa87f68ade1b'), ('c1089c0e-d268-4c22-bee6-20c4c72b4b32', 'd158b51b-c041-4c12-930b-aa87f68ade1b'), ('c1089c0e-d268-4c22-bee6-20c4c72b4b32', '300325a1-59b2-4412-b4dd-47e9486fdaf7'), ('22fa0374-b252-4245-92b1-bfc13ab0b108', '237d2cd5-e5a5-4fba-8c28-aef9bf89edc1')

## chat_conversations
before=5 deleted=5 after=0
ids: 8d67187c-33cc-4cf0-9d6f-082e67b97e5e, 237d2cd5-e5a5-4fba-8c28-aef9bf89edc1, d158b51b-c041-4c12-930b-aa87f68ade1b, 300325a1-59b2-4412-b4dd-47e9486fdaf7, de3c193f-01a8-47d1-8b4a-c54de0198706

## Pass 4 (chat, PostgREST): chat_attachments=6 chat_messages=73 chat_participants=11 chat_conversations=5
## Pass 5 (KYC guard-lift #2, db query --linked, atomicity proven empirically):
Dropped trg_kyc_document_access_log_no_mutate → deleted kyc_document_access_log=11,
kyc_documents=3, kyc_profiles=2 → trigger re-created verbatim from 109:116-118.
Verified: both triggers O · guard-bite probe PASS (append-only raises) · all kyc_* = 0.
Pre-delete captures: kyc doc paths kyc/a0536ffe-fbfe-45fa-9f00-931468a17251.png,
kyc/4cbf3989-f474-4552-8f65-7234eb872b12.pdf, kyc/27cc9834-0a98-49d8-a6dd-b35d194d5f15.pdf;
profiles ***0831 individual pending walk-in, ***5415 juristic pending walk-in.
## Storage (dry-run first on all 4 buckets — 13 objects, all row-referenced, ZERO orphans)
manual-payment-slips: 4 -> 0 (4 deleted) · chat-attachments: 6 -> 0 (6 deleted)
kyc-profile-documents: 3 -> 0 (3 deleted) · kyc-documents (legacy): already 0, untouched
Orphan list: (empty — none found in any bucket)

---

## Post-cleanup smoke test (2026-07-16)

6/6 probes passed against the remote project (app on :3001 pointed at
`yzjczvzwmbbeyoodrjwm`): boot+login · /admin/kyc renders + queue endpoint
(staff → 403 with remote-logged denial; super_admin → 200) · walk-in create
with holder_name (200 pending) · verify-without-documents → 422
KYC_DOCUMENTS_INCOMPLETE · reject → mig-121 RPC 200 rejected (no schema-cache
404s anywhere) · smoke profile deleted (kyc_profiles back to 0).

Intentional append-only residue: 1 rejected `kyc_verification_decisions` row +
3 `kyc_document_access_log` rows — the smoke test's own audit trail. The
guards correctly refused deletion (mig-112 decision guard raised and rolled
back atomically); a third guard-lift was deliberately declined.

Smoke account `smoke-staff@hopnic-test.local` exists remotely at role `staff`
(created via Auth Admin API; temporary super_admin elevation for probes 4–5
reverted).
