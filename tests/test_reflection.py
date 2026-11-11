"""Offline unit tests for ``detection.reflection.detect_all_reflections``.

These tests never perform network I/O and never launch a browser.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from detection.reflection import detect_all_reflections


class DetectAllReflectionsEmptyInputTests(unittest.TestCase):
    def test_empty_value_returns_empty_list(self):
        self.assertEqual(detect_all_reflections("<html>abc</html>", ""), [])

    def test_empty_html_returns_empty_list(self):
        self.assertEqual(detect_all_reflections("", "abc"), [])

    def test_both_empty_returns_empty_list(self):
        self.assertEqual(detect_all_reflections("", ""), [])

    def test_value_not_present_returns_empty_list(self):
        self.assertEqual(detect_all_reflections("<html>abc</html>", "zzz"), [])


class DetectAllReflectionsBasicContextTests(unittest.TestCase):
    def test_value_before_any_tag_is_unknown_with_none_tags(self):
        result = detect_all_reflections("prefixXYZsuffix", "XYZ")
        self.assertEqual(result, [{"context": "unknown", "tags": None}])

    def test_value_in_text_body_is_html_with_tag_name(self):
        html = "<div>hello XYZ world</div>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(result, [{"context": "html", "tags": "div"}])

    def test_value_in_attribute_value_is_attribute(self):
        html = "<input value='XYZ' />"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(result, [{"context": "attribute", "tags": "input"}])

    def test_value_in_double_quoted_attribute_value(self):
        html = '<input value="XYZ">'
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(result, [{"context": "attribute", "tags": "input"}])

    def test_value_in_url_attribute_is_url_context(self):
        html = '<a href="https://example.test/XYZ">x</a>'
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(result, [{"context": "url", "tags": "a"}])

    def test_value_in_unquoted_attribute_is_attribute(self):
        html = "<input value=XYZ>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(result, [{"context": "attribute", "tags": "input"}])

    def test_value_in_src_attribute_is_url_context(self):
        html = '<img src="https://cdn.test/XYZ.png" />'
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(result, [{"context": "url", "tags": "img"}])


class DetectAllReflectionsCommentTests(unittest.TestCase):
    def test_value_inside_html_comment_is_comment_context(self):
        html = "<div>a</div><!-- secret XYZ here --><p>b</p>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(result, [{"context": "comment", "tags": "div"}])

    def test_value_inside_unclosed_comment_is_comment_context(self):
        html = "<div>a</div><!-- secret XYZ here"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(result, [{"context": "comment", "tags": "div"}])

    def test_value_after_comment_is_html_not_comment(self):
        html = "<!-- comment --><span>XYZ</span>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(result, [{"context": "html", "tags": "span"}])

    def test_dashes_without_full_comment_openers_are_text(self):
        html = "<div>XYZ -- not a comment</div>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(result, [{"context": "html", "tags": "div"}])


class DetectAllReflectionsScriptTests(unittest.TestCase):
    def test_value_in_script_code_is_javascript(self):
        html = "<script>var x = 'safe'; alert(XYZ);</script>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(result, [{"context": "javascript", "tags": "script"}])

    def test_value_inside_script_string_literal_is_not_javascript(self):
        html = "<script>var x = 'he said XYZ';</script>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(
            result, [{"context": "javascript_string", "tags": "script"}]
        )

    def test_value_inside_double_quoted_script_string(self):
        html = '<script>var x = "he said XYZ";</script>'
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(
            result, [{"context": "javascript_string", "tags": "script"}]
        )

    def test_value_inside_template_literal_is_not_javascript(self):
        html = "<script>var x = `hello XYZ`;</script>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(
            result, [{"context": "javascript_string", "tags": "script"}]
        )

    def test_escaped_quote_does_not_terminate_script_string(self):
        html = r"""<script>var x = "a\" XYZ b";</script>"""
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(
            result, [{"context": "javascript_string", "tags": "script"}]
        )

    def test_value_after_closed_script_is_not_javascript(self):
        html = "<script>var x = 1;</script><div>XYZ</div>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(result, [{"context": "html", "tags": "div"}])

    def test_value_after_script_close_then_new_tag_tracks_nearest_tag(self):
        html = "<script>var x = 1;</script><section><b>XYZ</b></section>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(result, [{"context": "html", "tags": "b"}])

    def test_script_inside_single_quoted_string_still_closed_by_end_tag(self):
        # HTML parsing always terminates raw script data at </script>.
        html = "<script>var x = 'partial XYZ"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(
            result, [{"context": "javascript_string", "tags": "script"}]
        )

    def test_line_comment_content_is_not_string_literal(self):
        html = "<script>// XYZ comment\nfoo();</script>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(result, [{"context": "javascript", "tags": "script"}])

    def test_block_comment_content_is_not_string_literal(self):
        html = "<script>/* XYZ block */ foo();</script>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(result, [{"context": "javascript", "tags": "script"}])

    def test_value_in_script_then_body_gives_two_distinct_contexts(self):
        html = "<script>var x = XYZ;</script><p>XYZ</p>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(
            result,
            [
                {"context": "javascript", "tags": "script"},
                {"context": "html", "tags": "p"},
            ],
        )


class DetectAllReflectionsTagNameAndAttributeNameTests(unittest.TestCase):
    def test_value_in_tag_name_is_tag_name_not_html(self):
        html = "<myXYZtag id='1'></myXYZtag>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(len(result), 2)
        # Reflection in the opening tag name.
        self.assertEqual(result[0]["context"], "tag_name")
        self.assertEqual(result[0]["tags"], "myxyztag")
        # Reflection in the closing tag is markup, still never "html".
        self.assertNotEqual(result[1]["context"], "html")
        self.assertEqual(result[1]["tags"], "myxyztag")

    def test_value_in_attribute_name_is_attribute_name(self):
        html = "<div data-XYZ-field='1'></div>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(
            result, [{"context": "attribute_name", "tags": "div"}]
        )

    def test_value_in_url_attribute_name_is_attribute_name_not_url(self):
        html = "<a myXYZhref='https://example.test'>x</a>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(
            result, [{"context": "attribute_name", "tags": "a"}]
        )

    def test_value_between_attributes_is_not_html(self):
        # Reflection lands on markup whitespace inside an opening tag.
        html = "<div id='1' XYZ class='c'></div>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(len(result), 1)
        self.assertNotEqual(result[0]["context"], "html")
        self.assertEqual(result[0]["tags"], "div")

    def test_value_in_closing_tag_is_not_html(self):
        html = "<div>x</div XYZ><p>y</p>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(len(result), 1)
        self.assertNotEqual(result[0]["context"], "html")
        self.assertEqual(result[0]["tags"], "div")


class DetectAllReflectionsMultipleOccurrenceTests(unittest.TestCase):
    def test_every_occurrence_is_returned_in_order(self):
        html = "<p>XYZ</p><span>XYZ</span>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(
            result,
            [
                {"context": "html", "tags": "p"},
                {"context": "html", "tags": "span"},
            ],
        )

    def test_inconsistent_contexts_across_reflections(self):
        html = (
            "<input value='XYZ'>"
            "<script>var y = XYZ;</script>"
            "<!-- XYZ -->"
        )
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(
            result,
            [
                {"context": "attribute", "tags": "input"},
                {"context": "javascript", "tags": "script"},
                {"context": "comment", "tags": "script"},
            ],
        )

    def test_overlapping_occurrences_do_not_rescan_same_characters(self):
        html = "<div>aaaa</div>"
        result = detect_all_reflections(html, "aa")
        self.assertEqual(
            result,
            [
                {"context": "html", "tags": "div"},
                {"context": "html", "tags": "div"},
            ],
        )

    def test_return_structure_contains_only_context_and_tags(self):
        result = detect_all_reflections("<b>XYZ</b>", "XYZ")
        self.assertEqual(len(result), 1)
        self.assertEqual(set(result[0].keys()), {"context", "tags"})


class DetectAllReflectionsCdataAndDoctypeTests(unittest.TestCase):
    def test_value_inside_cdata_is_not_html(self):
        html = "<svg><![CDATA[ XYZ payload ]]></svg>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(len(result), 1)
        self.assertNotEqual(result[0]["context"], "html")
        self.assertEqual(result[0]["context"], "cdata")

    def test_value_after_doctype_is_html(self):
        html = "<!DOCTYPE html><html><body>XYZ</body></html>"
        result = detect_all_reflections(html, "XYZ")
        self.assertEqual(result, [{"context": "html", "tags": "body"}])


if __name__ == "__main__":
    unittest.main()
