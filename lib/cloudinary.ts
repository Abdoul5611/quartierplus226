import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function uploadImage(
  filePath: string,
  folder: string = "quartierplus/produits"
): Promise<string> {
  const result = await cloudinary.uploader.upload(filePath, {
    folder,
    resource_type: "image",
  });
  return result.secure_url;
}

export async function uploadAudio(
  filePath: string,
  folder: string = "quartierplus/audio"
): Promise<string> {
  const result = await cloudinary.uploader.upload(filePath, {
    folder,
    resource_type: "video",
  });
  return result.secure_url;
}

export async function deleteMedia(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}

export { cloudinary };
