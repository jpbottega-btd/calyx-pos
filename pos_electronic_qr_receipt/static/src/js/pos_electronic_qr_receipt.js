odoo.define('pos_electronic_qr_receipt', function (require) {
    var models = require('point_of_sale.models');
    var screens = require('point_of_sale.screens');
    var rpc = require('web.rpc');
    var core = require('web.core');
    var qweb = core.qweb;

    var _super_Order = models.Order.prototype;
    models.Order = models.Order.extend({
        initialize: function (attributes, options) {
            _super_Order.initialize.apply(this, arguments);
            if (this.pos.config.pos_auto_invoice) {
                this.to_invoice = true;
            }
        },
        init_from_JSON: function (json) {
            var res = _super_Order.init_from_JSON.apply(this, arguments);
            if (json.to_invoice) {
                this.to_invoice = json.to_invoice;
            }
        }
    });
    screens.ReceiptScreenWidget.include({
        print_xml: function () {
            var self = this;
            if (this.pos.config.receipt_invoice_number) {
                self.receipt_data = this.get_receipt_render_env();
                var order = this.pos.get_order();
                return rpc.query({
                    model: 'pos.order',
                    method: 'search_read',
                    domain: [['pos_reference', '=', order['name']]],
                    fields: ['account_move'],
                }).then(function (orders) {
                    if (orders.length > 0) {
                        if (orders[0]['account_move']) {
							var account_move = orders[0]['account_move'][0];
                            var invoice_number = orders[0]['account_move'][1];
                            var match = invoice_number.match(/^[^(]+/);
                            var invoice_number_trim = match ? match[0].trim() : '';
                            // var invoice_number_trim = invoice_number.replace(/\s*\(.*?\)\s*/g, '').trim();
                            self.receipt_data['order']['invoice_number'] = invoice_number_trim;
                            rpc.query({
							     model: 'account.move',
							     method: 'search_read',
							     args: [[['id', '=', account_move]], ['afip_auth_code',
							                                        'afip_qr_code', 'afip_auth_code_due'
							                                        ]],
							}).then(function (invoices) {
							    self.receipt_data['order']['afip_auth_code'] = invoices[0]['afip_auth_code'];
							    self.receipt_data['order']['afip_qr_code'] = invoices[0]['afip_qr_code'];
							    self.receipt_data['order']['afip_auth_code_due'] = new Date(invoices[0]['afip_auth_code_due']).toLocaleString('es-AR');
							});
                        }
                    }
                    var receipt = qweb.render('XmlReceipt', self.receipt_data);
                    self.pos.proxy.print_receipt(receipt);
                });
            } else {
                this._super();
            }
        },
        render_receipt: function () {
            this._super();
            var self = this;
            var order = this.pos.get_order();
            if (!this.pos.config.iface_print_via_proxy && this.pos.config.receipt_invoice_number && order.is_to_invoice()) {
                var invoiced = new $.Deferred();
                rpc.query({
                    model: 'pos.order',
                    method: 'search_read',
                    domain: [['pos_reference', '=', order['name']]],
                    fields: ['account_move']
                }).then(function (orders) {
                    if (orders.length > 0 && orders[0]['account_move'] && orders[0]['account_move'][1]) {
                        var account_move = orders[0]['account_move'][0];
                        var invoice_number = orders[0]['account_move'][1];
                        var match = invoice_number.match(/^[^(]+/);
                        var invoice_number_trim = match ? match[0].trim() : '';
                        // var invoice_number_trim = invoice_number.replace(/\s*\(.*?\)\s*/g, '').trim();
                        self.pos.get_order()['invoice_number'] = invoice_number_trim;
                        rpc.query({
						     model: 'account.move',
						     method: 'search_read',
						     args: [[['id', '=', account_move]], ['afip_auth_code',
						                                        'afip_qr_code', 'afip_auth_code_due',
						                                        ]],
						}).then(function (invoices) {
						    self.pos.get_order()['afip_auth_code'] = invoices[0]['afip_auth_code'];
					        self.pos.get_order()['afip_qr_code'] = invoices[0]['afip_qr_code'];
					        self.pos.get_order()['afip_auth_code_due'] = new Date(invoices[0]['afip_auth_code_due']).toLocaleString('es-AR');
							self.$('.pos-receipt-container').html(qweb.render('OrderReceipt', self.get_receipt_render_env()));
						});
                    }
                    invoiced.resolve();
                }).catch(function (type, error) {
                    invoiced.reject(error);
                });
                return invoiced;
            } else {
                this._super();
            }
        },
    })
});
