ALTER TABLE public.packing_items
DROP CONSTRAINT IF EXISTS packing_items_box_num_key;

ALTER TABLE public.packing_items
DROP CONSTRAINT IF EXISTS unique_box_num;

ALTER TABLE public.packing_items
DROP CONSTRAINT IF EXISTS unique_wo_box_item;

ALTER TABLE public.packing_items
ADD CONSTRAINT unique_wo_box_item
UNIQUE (wo_num, box_num, item_num);
