"""Test suite runner for SARAL Issue #39 solution."""

import sys
from pathlib import Path

# Ensure SARAL root is in sys.path
root_dir = Path(__file__).resolve().parent.parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

import unittest

from solution.tests.test_math_preservation import TestMathPreservation
from solution.tests.test_presentation_archetypes import TestPresentationArchetypes
from solution.tests.test_poster_archetypes import TestPosterArchetypes
from solution.tests.test_multilingual import TestMultilingualSupport
from solution.tests.test_scientific_integrity import TestScientificIntegrity
from solution.tests.test_backward_compatibility import TestBackwardCompatibility
from solution.tests.test_integration_payloads import TestIntegrationPayloads


def run_suite():
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    suite.addTests(loader.loadTestsFromTestCase(TestMathPreservation))
    suite.addTests(loader.loadTestsFromTestCase(TestPresentationArchetypes))
    suite.addTests(loader.loadTestsFromTestCase(TestPosterArchetypes))
    suite.addTests(loader.loadTestsFromTestCase(TestMultilingualSupport))
    suite.addTests(loader.loadTestsFromTestCase(TestScientificIntegrity))
    suite.addTests(loader.loadTestsFromTestCase(TestBackwardCompatibility))
    suite.addTests(loader.loadTestsFromTestCase(TestIntegrationPayloads))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(run_suite())
