import {
  listCouponsService,
  getCouponService,
  createCouponService,
  updateCouponService,
  deleteCouponService,
  listCouponRedemptionsService
} from "../services/adminCoupon.service.js";
import { success, error } from "../helpers/response.helper.js";

export const listCoupons = async (req, res) => {
  try {
    return success(res, await listCouponsService(req.query), "Coupons fetched");
  } catch (err) { return error(res, err.message, 400); }
};

export const getCoupon = async (req, res) => {
  try {
    return success(res, await getCouponService(req.params.id), "Coupon fetched");
  } catch (err) { return error(res, err.message, err.message === "Coupon not found" ? 404 : 400); }
};

export const createCoupon = async (req, res) => {
  try {
    return success(res, await createCouponService(req.body), "Coupon created", 201);
  } catch (err) { return error(res, err.message, 400); }
};

export const updateCoupon = async (req, res) => {
  try {
    return success(res, await updateCouponService(req.params.id, req.body), "Coupon updated");
  } catch (err) { return error(res, err.message, 400); }
};

export const deleteCoupon = async (req, res) => {
  try {
    return success(res, await deleteCouponService(req.params.id), "Coupon removed");
  } catch (err) { return error(res, err.message, 400); }
};

export const listCouponRedemptions = async (req, res) => {
  try {
    return success(res, await listCouponRedemptionsService(req.params.id, req.query), "Redemptions fetched");
  } catch (err) { return error(res, err.message, 400); }
};
