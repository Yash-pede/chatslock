import {userOnboardingSchema} from "@repo/api/schema";

export const onboardingController = async (c: Context) => {
    const {body}: userOnboardingSchema = c.get("valid");
    //     Insert user into DB


}