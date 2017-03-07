'use strict';

var _ = require('underscore');
var common = require('../common');
var companyController = null;
var Security = require('../lib/security');
var orm = require('orm');
var selectn = require('selectn');
var striptags = require('striptags');
var async = require('async');
var SessionLogManager = require('../lib/session-log-manager');
var CompanySearchHelper = require('../lib/company-search-helper');

/*

    GET /company/:company_seo_title (seo_title is company_id.company_name)
    GET /company/:company_seo_title/reviews/create - make a new review page
    GET /company/:company_seo_title/salaries/create - make a new salary

    GET /company/:company_seo_title/reviews
    GET /company/:company_seo_title/salaries

 */

/**
 * Home controller.
 */
function CompanyController() {
    /**
     * Express app.
     * @type {[type]}
     */
    this.app = null;
}

/**
 * setup controller.
 * @param  {[type]} app [description]
 * @return {[type]}     [description]
 */
CompanyController.prototype.setup = function(app) {
    this.app = app;

    app.get('/companies/list/:pageNumber', this.getListCompanies.bind(this));
    app.get('/companies/suggest', this.getSuggestCompany.bind(this));

    // Backend entry.
    app.get('/backend/companies/:pageNumber',
        Security.requiredScope('admin:companies:read'),
        this.getBackendCompanies.bind(this));

    app.get('/company/:companySeoTitle/suggested',
        this.loadCompany.bind(this),
        this.getCompanySuggested.bind(this));

    // Backend entry - REST
    app.put('/rest/v1/backend/company/:companyId/approval/:approved',
        Security.requiredScope('admin:companies:write'),
        this.restBackendApproveCompany.bind(this));

    // Backend entry - REST
    app.put('/rest/v1/backend/company/:companyId/remove/:removed',
        Security.requiredScope('admin:companies:remove'),
        this.restBackendRemoveCompany.bind(this));

    app.put('/rest/v1/backend/company/:companyId/add_name',
        Security.requiredScope('admin:companies:write'),
        this.restBackendAddCompanyName.bind(this));

    app.put('/rest/v1/backend/company/replace/:leftCompanyId/with/:rightCompanyId',
        Security.requiredScope('admin:companies:write'),
        this.restBackendReplaceCompany.bind(this));

    app.put('/rest/v1/backend/company/:companyId/rename',
        Security.requiredScope('admin:companies:write'),
        this.restBackendRenameCompany.bind(this));

    app.put('/rest/v1/backend/company/:companyId/ignore/:ignored',
        Security.requiredScope('admin:companies:write'),
        this.restBackendIgnoreCompany.bind(this));


    app.delete('/rest/v1/backend/company/remove_name/:companyNameId',
        Security.requiredScope('admin:companies:remove'),
        this.restBackendRemoveCompanyName.bind(this));


    // Form POSTs
    app.post('/companies/suggest', this.postSuggestCompany.bind(this));
    app.get('/companies/search', this.getSearchCompany.bind(this));

    app.get('/company/:companySeoTitle',
        this.loadCompany.bind(this),
        this.getCompanyInfo.bind(this));

    app.get('/rest/v1/company/search', this.restSearchCompany.bind(this));

    app.post('/rest/v1/company/:companyId/track_30s_view', this.restTrack30sView.bind(this));
    app.post('/rest/v1/company/:companyId/track_15s_view', this.restTrack15sView.bind(this));

    // REST - Suggest company.
    app.post('/rest/v1/company/suggest', this.restSuggestCompany.bind(this));
};


/**
 * Get Or create new empty company.
 * @param  {[type]}   companyId   [description]
 * @param  {[type]}   companyName [description]
 * @param  {[type]}   req         [description]
 * @param  {Function} callback    [description]
 * @return {[type]}               [description]
 */
CompanyController.prototype.createOrGetCompany = function(companyName, req, callback) {
    var self = this;

    if (_.isEmpty(companyName)) {
        process.nextTick(function() {
            callback(new Error('missing company name'));
        });
        return;
    }

    // Create company or use existing one if needed.
    GLOBAL.models.Company.find({ deleted: false })
    .where('deleted = 0 AND (LOWER(name) = ?)', [companyName.toLowerCase()])
    .all(function(err, companies) {
        if (err) {
            logger.error('finding company', { company_name: companyName, error: err});
            return callback(err);
        }

        if (_.isEmpty(companies)) {
            // Just create empty company profile here that needs approval.
            self.createEmptyCompany(companyName, req, callback);
        } else {
            var company = companies[0];
            callback(null, company);
        }
    });
};

/**
 * Make new empty company.
 * @param  {[type]}   companyName [description]
 * @param  {Function} callback    [description]
 * @return {[type]}               [description]
 */
CompanyController.prototype.createEmptyCompany = function(companyName, req, callback) {
    GLOBAL.models.Company.create({
        name: companyName,
        industry_id: 1,
        source_ip: req.ip,
    }, function(err, company) {
        if (err) {
            logger.error('Error creating empty company', {
                company_name: companyName,
                error: err
            });
            return callback(err);
        }

        callback(null, company);
    });
};


/**
 * Return companyId and companyName from req.params.
 * @param  {[type]} req [description]
 * @return {[type]}     [description]
 */
CompanyController.prototype.getCompanyInfoFromParams = function(req) {
    var companyParts = req.params.companySeoTitle.split('.');

    return {
        companyId: companyParts[0],
        companyName: companyParts[1],
    };
};

/**
 * Create company SEO Title.
 * @param  {[type]} companyId [description]
 * @param  {[type]} name      [description]
 * @return {[type]}           [description]
 */
CompanyController.prototype.createSeoTitle = function(companyId, name) {
    return companyId + '.' + name;
};

function test() {
    common.restRespondError(res, 404, __n('Ova stranica ne postoji %s'));
}

/**
 * Get company controller.
 * @return {[type]} [description]
 */
module.exports.get = function() {
    return companyController;
};